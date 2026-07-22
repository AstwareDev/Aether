//! Real interactive shell sessions backing the Terminal panel.
//!
//! Bridged to the frontend the same way `ai.rs` streams tokens: an
//! `ipc::Channel` handed to the spawn command, held onto by a background
//! reader thread for the life of the session.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use base64::Engine;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct PtyMap(Arc<Mutex<HashMap<String, PtySession>>>);

/// Streamed back to the frontend for a given session id.
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PtyEvent {
    /// Base64-encoded raw bytes read from the pty. Base64 (rather than
    /// assuming each read lands on a UTF-8 boundary) lets the frontend decode
    /// incrementally with a streaming `TextDecoder`, which is what actually
    /// handles multi-byte characters split across reads.
    Output { data: String },
    Exit { code: i32 },
}

/// `shell` is the id picked in the terminal panel's shell dropdown
/// (`"powershell"` / `"cmd"`); anything else falls back to PowerShell. Not
/// meaningful outside Windows, where `$SHELL` always wins.
fn shell_command(shell: &str, cwd: &str) -> CommandBuilder {
    let mut cmd = if cfg!(target_os = "windows") {
        match shell {
            "cmd" => CommandBuilder::new("cmd.exe"),
            _ => CommandBuilder::new("powershell.exe"),
        }
    } else {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        CommandBuilder::new(shell)
    };
    cmd.cwd(cwd);
    cmd
}

/// Spawn a shell in `cwd` and start streaming its output over `on_event`.
/// Returns once the session is registered; output/exit arrive asynchronously.
#[tauri::command]
pub fn pty_spawn(
    id: String,
    shell: String,
    cwd: String,
    cols: u16,
    rows: u16,
    state: State<PtyMap>,
    on_event: Channel<PtyEvent>,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("failed to open pty: {e}"))?;

    let mut child = pair
        .slave
        .spawn_command(shell_command(&shell, &cwd))
        .map_err(|e| format!("failed to spawn shell: {e}"))?;
    drop(pair.slave);

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("failed to open pty writer: {e}"))?;
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("failed to open pty reader: {e}"))?;
    let killer = child.clone_killer();

    let map = state.0.clone();
    map.lock().unwrap().insert(
        id.clone(),
        PtySession {
            writer,
            master: pair.master,
            killer,
        },
    );

    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                    if on_event.send(PtyEvent::Output { data }).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let code = child
            .wait()
            .map(|status| status.exit_code() as i32)
            .unwrap_or(-1);
        let _ = on_event.send(PtyEvent::Exit { code });
        map.lock().unwrap().remove(&id);
    });

    Ok(())
}

/// Write raw keystrokes/paste data to a session's shell.
#[tauri::command]
pub fn pty_write(id: String, data: String, state: State<PtyMap>) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    let session = map.get_mut(&id).ok_or("no such terminal session")?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("failed to write to pty: {e}"))?;
    session.writer.flush().map_err(|e| e.to_string())
}

/// Reflow a session's pty to match the terminal widget's new size.
#[tauri::command]
pub fn pty_resize(id: String, cols: u16, rows: u16, state: State<PtyMap>) -> Result<(), String> {
    let map = state.0.lock().unwrap();
    let session = map.get(&id).ok_or("no such terminal session")?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("failed to resize pty: {e}"))
}

/// Forcefully end a session (e.g. the workspace is closing).
#[tauri::command]
pub fn pty_kill(id: String, state: State<PtyMap>) -> Result<(), String> {
    if let Some(mut session) = state.0.lock().unwrap().remove(&id) {
        let _ = session.killer.kill();
    }
    Ok(())
}
