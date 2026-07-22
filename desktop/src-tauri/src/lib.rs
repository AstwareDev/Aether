mod ai;
mod terminal;

use std::path::Path;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use ignore::WalkBuilder;
use serde::Serialize;

fn create_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    cmd
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Serialize)]
struct DirEntryInfo {
    name: String,
    path: String,
    is_dir: bool,
}

/// List the immediate children of `path`, sorted directories-first then
/// alphabetically (case-insensitive). Used for lazy-loading the file tree.
#[tauri::command]
async fn read_dir(path: String) -> Result<Vec<DirEntryInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || read_dir_blocking(path))
        .await
        .map_err(|e| format!("task failed: {e}"))?
}

fn read_dir_blocking(path: String) -> Result<Vec<DirEntryInfo>, String> {
    const MAX_ENTRIES: usize = 10_000;
    let mut entries: Vec<DirEntryInfo> = Vec::new();

    let read = std::fs::read_dir(&path).map_err(|e| format!("failed to read directory: {e}"))?;
    for entry in read {
        if entries.len() >= MAX_ENTRIES {
            break;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path().to_string_lossy().to_string();
        entries.push(DirEntryInfo {
            name,
            path,
            is_dir: file_type.is_dir(),
        });
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Read a file as UTF-8 text. Rejects files larger than 5 MiB and files that
/// aren't valid UTF-8 (likely binary) so the editor never chokes on them.
#[tauri::command]
fn read_file_text(path: String) -> Result<String, String> {
    const MAX_BYTES: u64 = 5 * 1024 * 1024;

    let metadata = std::fs::metadata(&path).map_err(|e| format!("failed to stat file: {e}"))?;
    if metadata.len() > MAX_BYTES {
        return Err("File is too large to open (over 5 MB).".to_string());
    }

    let bytes = std::fs::read(&path).map_err(|e| format!("failed to read file: {e}"))?;
    String::from_utf8(bytes).map_err(|_| "File is not valid UTF-8 text.".to_string())
}

#[derive(Serialize)]
struct FileTextResult {
    path: String,
    /// `None` when the file was too large, not valid UTF-8, or unreadable —
    /// callers treat this as "skip", not as a fatal error for the whole batch.
    text: Option<String>,
}

/// Batch-read many files as UTF-8 text in one IPC round-trip. Used to prime
/// the workspace-wide IntelliSense index without one `read_file_text` call
/// per file. Per-file guards mirror `read_file_text`, but a single bad file
/// (too large / binary / deleted mid-scan) just yields `text: None` for that
/// entry rather than failing the whole batch.
#[tauri::command]
async fn read_files_text(paths: Vec<String>) -> Result<Vec<FileTextResult>, String> {
    tauri::async_runtime::spawn_blocking(move || read_files_text_blocking(paths))
        .await
        .map_err(|e| format!("task failed: {e}"))
}

fn read_files_text_blocking(paths: Vec<String>) -> Vec<FileTextResult> {
    const MAX_BYTES: u64 = 1024 * 1024; // smaller than read_file_text's 5 MiB — these are background index entries, not the actively-edited file.

    paths
        .into_iter()
        .map(|path| {
            let text = std::fs::metadata(&path)
                .ok()
                .filter(|m| m.len() <= MAX_BYTES)
                .and_then(|_| std::fs::read(&path).ok())
                .and_then(|bytes| String::from_utf8(bytes).ok());
            FileTextResult { path, text }
        })
        .collect()
}

/// Write UTF-8 text back to a file on disk. Written atomically (temp file +
/// rename) so a crash mid-write can't leave a truncated file.
#[tauri::command]
fn write_file_text(path: String, contents: String) -> Result<(), String> {
    let target = Path::new(&path);
    let file_name = target
        .file_name()
        .ok_or_else(|| "invalid file path".to_string())?
        .to_string_lossy();
    let tmp = target.with_file_name(format!(".{file_name}.aether-tmp"));

    std::fs::write(&tmp, contents).map_err(|e| format!("failed to write file: {e}"))?;
    std::fs::rename(&tmp, target).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("failed to write file: {e}")
    })
}

#[derive(Serialize)]
struct FileEntry {
    /// Absolute path on disk.
    path: String,
    /// Path relative to the workspace root, using `/` separators (for display + fuzzy search).
    rel: String,
}

/// Recursively index every file under `root` for the quick-open palette.
/// Honors `.gitignore` / `.ignore`, always skips `.git`, and caps the result
/// so pathological trees can't hang the UI.
#[tauri::command]
async fn list_files(root: String) -> Result<Vec<FileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || list_files_blocking(root))
        .await
        .map_err(|e| format!("task failed: {e}"))?
}

fn list_files_blocking(root: String) -> Result<Vec<FileEntry>, String> {
    const MAX_FILES: usize = 50_000;

    let root_path = Path::new(&root);
    let mut files: Vec<FileEntry> = Vec::new();

    let walker = WalkBuilder::new(&root)
        .hidden(false) // dotfiles are shown, like VS Code's quick-open
        .git_ignore(true)
        .git_exclude(true)
        .git_global(false)
        .parents(true)
        .filter_entry(|entry| entry.file_name() != ".git")
        .build();

    for result in walker {
        if files.len() >= MAX_FILES {
            break;
        }
        let entry = match result {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }
        let path = entry.path();
        let rel = path
            .strip_prefix(root_path)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        files.push(FileEntry {
            path: path.to_string_lossy().to_string(),
            rel,
        });
    }

    Ok(files)
}

/// Create a new empty file or directory. Fails if the target already exists.
#[tauri::command]
fn create_entry(path: String, is_dir: bool) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("An item with that name already exists.".to_string());
    }
    if is_dir {
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())
    } else {
        if let Some(parent) = Path::new(&path).parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&path, "").map_err(|e| e.to_string())
    }
}

/// Rename / move a file or directory. Rejects when a *different* entry already
/// occupies the destination, but allows case-only renames on case-insensitive
/// filesystems (Windows/macOS) where `to` resolves to `from` itself.
#[tauri::command]
fn rename_entry(from: String, to: String) -> Result<(), String> {
    if Path::new(&to).exists() {
        let same_entry = matches!(
            (std::fs::canonicalize(&from), std::fs::canonicalize(&to)),
            (Ok(a), Ok(b)) if a == b
        );
        if !same_entry {
            return Err("An item with that name already exists.".to_string());
        }
    }
    std::fs::rename(&from, &to).map_err(|e| e.to_string())
}

/// Permanently delete a file or directory (recursively).
#[tauri::command]
fn delete_entry(path: String) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

#[derive(Serialize)]
struct GitFileStatus {
    path: String,
    status: String, // "M", "A", "D", "R", "?", etc.
}

/// Run `git status --porcelain` in `root` and return per-file status entries.
#[tauri::command]
async fn git_status(root: String) -> Result<Vec<GitFileStatus>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = create_command("git")
            .args(["status", "--porcelain", "-uall"])
            .current_dir(&root)
            .output()
            .map_err(|e| format!("failed to run git: {e}"))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut files = Vec::new();
        for line in stdout.lines() {
            if line.len() < 3 {
                continue;
            }
            let xy = &line[..2];
            let path = line[3..].trim().to_string();
            // Prefer the index status; fall back to worktree status.
            let x = xy.chars().next().unwrap_or(' ');
            let y = xy.chars().nth(1).unwrap_or(' ');
            let status = if x != ' ' && x != '?' { x } else { y };
            files.push(GitFileStatus {
                path,
                status: status.to_string(),
            });
        }
        Ok(files)
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?
}

/// Run `git diff HEAD -- <file>` (or `git diff -- <file>` for untracked) to get
/// a unified diff for the given file relative to the repo root.
#[tauri::command]
async fn git_diff(root: String, file_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Try staged+unstaged diff first (HEAD vs working tree).
        let output = create_command("git")
            .args(["diff", "HEAD", "--", &file_path])
            .current_dir(&root)
            .output()
            .map_err(|e| format!("failed to run git: {e}"))?;

        if output.status.success() && !output.stdout.is_empty() {
            return Ok(String::from_utf8_lossy(&output.stdout).to_string());
        }

        // Untracked file: diff against /dev/null equivalent.
        let output2 = create_command("git")
            .args(["diff", "--no-index", "--", "/dev/null", &file_path])
            .current_dir(&root)
            .output()
            .map_err(|e| format!("failed to run git: {e}"))?;

        Ok(String::from_utf8_lossy(&output2.stdout).to_string())
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?
}

/// Stage all changes (`git add -A`) in the given repo root.
#[tauri::command]
async fn git_stage_all(root: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = create_command("git")
            .args(["add", "-A"])
            .current_dir(&root)
            .output()
            .map_err(|e| format!("failed to run git: {e}"))?;

        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?
}

/// Create a git commit with the given message.
#[tauri::command]
async fn git_commit(root: String, message: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = create_command("git")
            .args(["commit", "-m", &message])
            .current_dir(&root)
            .output()
            .map_err(|e| format!("failed to run git: {e}"))?;

        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?
}

/// Get the current git branch name.
#[tauri::command]
async fn git_branch(root: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = create_command("git")
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
            .current_dir(&root)
            .output()
            .map_err(|e| format!("failed to run git: {e}"))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?
}

/// Run `git show HEAD:<file>` to get the committed version of a file.
/// Returns empty string if the file doesn't exist in HEAD (new/untracked).
#[tauri::command]
async fn git_show(root: String, file_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = create_command("git")
            .args(["show", &format!("HEAD:{}", file_path)])
            .current_dir(&root)
            .output()
            .map_err(|e| format!("failed to run git: {e}"))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            // New/untracked file — no committed version exists.
            Ok(String::new())
        }
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?
}

#[derive(Serialize)]
struct GitCommit {
    hash: String,
    short_hash: String,
    author: String,
    date: String,
    message: String,
    refs: String,
}

/// Get structured commit log (HEAD..HEAD~50).
#[tauri::command]
async fn git_log(root: String) -> Result<Vec<GitCommit>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = create_command("git")
            .args([
                "log",
                "--max-count=50",
                "--all",
                "--oneline",
                "--decorate",
                "--format=%H|%h|%an|%aI|%s|%D",
            ])
            .current_dir(&root)
            .output()
            .map_err(|e| format!("failed to run git: {e}"))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut commits = Vec::new();
        for line in stdout.lines() {
            let parts: Vec<&str> = line.splitn(6, '|').collect();
            if parts.len() < 6 {
                continue;
            }
            commits.push(GitCommit {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                author: parts[2].to_string(),
                date: parts[3].to_string(),
                message: parts[4].to_string(),
                refs: parts[5].to_string(),
            });
        }
        Ok(commits)
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?
}

/// Get raw git graph text for visual rendering.
#[tauri::command]
async fn git_log_graph(root: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = create_command("git")
            .args([
                "log",
                "--max-count=50",
                "--all",
                "--oneline",
                "--graph",
                "--decorate",
            ])
            .current_dir(&root)
            .output()
            .map_err(|e| format!("failed to run git: {e}"))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?
}

#[tauri::command]
fn clone_repository(url: String, dest: String) -> Result<(), String> {
    let output = create_command("git")
        .args(["clone", &url, &dest])
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Open the OS file manager at the given path (selects the item if it is a
/// file; opens the directory if it is a folder).
#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        create_command("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        create_command("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        // Best-effort: xdg-open the parent directory
        let dir = Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(path);
        create_command("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Open a new OS terminal window in `dir`.
#[tauri::command]
fn open_in_terminal(dir: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/c", "start", "cmd", "/k", &format!("cd /d {}", dir)])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Terminal", &dir])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        // Try common terminals in order
        let _ = Command::new("x-terminal-emulator")
            .current_dir(&dir)
            .spawn()
            .or_else(|_| Command::new("xterm").current_dir(&dir).spawn())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(terminal::PtyMap::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            clone_repository,
            read_dir,
            read_file_text,
            read_files_text,
            write_file_text,
            list_files,
            create_entry,
            rename_entry,
            delete_entry,
            ai::ai_complete,
            ai::ai_list_models,
            terminal::pty_spawn,
            terminal::pty_write,
            terminal::pty_resize,
            terminal::pty_kill,
            reveal_in_explorer,
            open_in_terminal,
            git_status,
            git_diff,
            git_show,
            git_log,
            git_log_graph,
            git_stage_all,
            git_commit,
            git_branch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
