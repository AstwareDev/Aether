mod ai;
mod terminal;

use std::path::Path;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use base64::Engine;
use ignore::WalkBuilder;
use serde::Serialize;

fn create_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    cmd
}

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
    text: Option<String>,
}

#[tauri::command]
async fn read_files_text(paths: Vec<String>) -> Result<Vec<FileTextResult>, String> {
    tauri::async_runtime::spawn_blocking(move || read_files_text_blocking(paths))
        .await
        .map_err(|e| format!("task failed: {e}"))
}

fn read_files_text_blocking(paths: Vec<String>) -> Vec<FileTextResult> {
    const MAX_BYTES: u64 = 1024 * 1024;

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
    path: String,
    rel: String,
}

#[derive(Serialize)]
struct SearchMatch {
    path: String,
    rel: String,
    line: usize,
    column: usize,
    text: String,
    before: Vec<String>,
    after: Vec<String>,
}

#[derive(Serialize)]
struct SearchResult {
    matches: Vec<SearchMatch>,
    file_count: usize,
    match_count: usize,
    truncated: bool,
}

#[tauri::command]
async fn search_files(
    root: String,
    query: String,
    case_sensitive: bool,
    whole_word: bool,
    use_regex: bool,
    include_pattern: Option<String>,
    exclude_pattern: Option<String>,
    context_lines: usize,
) -> Result<SearchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        search_files_blocking(
            root,
            query,
            case_sensitive,
            whole_word,
            use_regex,
            include_pattern,
            exclude_pattern,
            context_lines,
        )
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?
}

fn search_files_blocking(
    root: String,
    query: String,
    case_sensitive: bool,
    whole_word: bool,
    use_regex: bool,
    include_pattern: Option<String>,
    exclude_pattern: Option<String>,
    context_lines: usize,
) -> Result<SearchResult, String> {
    use regex::RegexBuilder;
    use std::collections::HashSet;
    use std::io::{BufRead, BufReader};

    const MAX_MATCHES: usize = 10_000;
    const MAX_FILES: usize = 1_000;

    if query.is_empty() {
        return Ok(SearchResult {
            matches: Vec::new(),
            file_count: 0,
            match_count: 0,
            truncated: false,
        });
    }

    let pattern = if use_regex {
        query.clone()
    } else {
        let escaped = regex::escape(&query);
        if whole_word {
            format!(r"\b{}\b", escaped)
        } else {
            escaped
        }
    };

    let regex = RegexBuilder::new(&pattern)
        .case_insensitive(!case_sensitive)
        .build()
        .map_err(|e| format!("invalid regex: {e}"))?;

    let include_glob = include_pattern.as_ref().and_then(|p| {
        if !p.is_empty() {
            globset::Glob::new(p).ok()
        } else {
            None
        }
    });

    let exclude_glob = exclude_pattern.as_ref().and_then(|p| {
        if !p.is_empty() {
            globset::Glob::new(p).ok()
        } else {
            None
        }
    });

    let root_path = Path::new(&root);
    let mut matches = Vec::new();
    let mut files_with_matches = HashSet::new();
    let mut truncated = false;

    let walker = WalkBuilder::new(&root)
        .hidden(false)
        .git_ignore(true)
        .git_exclude(true)
        .git_global(false)
        .parents(true)
        .filter_entry(|entry| entry.file_name() != ".git")
        .build();

    for result in walker {
        if matches.len() >= MAX_MATCHES || files_with_matches.len() >= MAX_FILES {
            truncated = true;
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

        if let Some(ref glob) = include_glob {
            if !glob.compile_matcher().is_match(&rel) {
                continue;
            }
        }

        if let Some(ref glob) = exclude_glob {
            if glob.compile_matcher().is_match(&rel) {
                continue;
            }
        }

        let file = match std::fs::File::open(path) {
            Ok(f) => f,
            Err(_) => continue,
        };

        let reader = BufReader::new(file);
        let mut lines: Vec<String> = Vec::new();

        for line_result in reader.lines() {
            let line = match line_result {
                Ok(l) => l,
                Err(_) => break,
            };
            lines.push(line);
        }

        let mut file_matches = Vec::new();
        for (line_idx, line_text) in lines.iter().enumerate() {
            if let Some(mat) = regex.find(line_text) {
                let before = if line_idx >= context_lines {
                    lines[line_idx - context_lines..line_idx].to_vec()
                } else {
                    lines[0..line_idx].to_vec()
                };

                let after_end = std::cmp::min(line_idx + context_lines + 1, lines.len());
                let after = lines[line_idx + 1..after_end].to_vec();

                file_matches.push(SearchMatch {
                    path: path.to_string_lossy().to_string(),
                    rel: rel.clone(),
                    line: line_idx + 1,
                    column: mat.start() + 1,
                    text: line_text.clone(),
                    before,
                    after,
                });

                if matches.len() + file_matches.len() >= MAX_MATCHES {
                    break;
                }
            }
        }

        if !file_matches.is_empty() {
            files_with_matches.insert(path.to_string_lossy().to_string());
            matches.extend(file_matches);
        }
    }

    Ok(SearchResult {
        match_count: matches.len(),
        file_count: files_with_matches.len(),
        matches,
        truncated,
    })
}

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
        .hidden(false)
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

#[tauri::command]
fn delete_entry(path: String) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn copy_entry(from: String, to: String) -> Result<(), String> {
    let from_path = Path::new(&from);
    let to_path = Path::new(&to);

    if to_path.exists() {
        return Err("An item with that name already exists.".to_string());
    }

    let metadata = std::fs::symlink_metadata(from_path).map_err(|e| e.to_string())?;

    if metadata.is_dir() {
        copy_dir_recursive(from_path, to_path)
    } else {
        if let Some(parent) = to_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::copy(from_path, to_path).map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn copy_dir_recursive(from: &Path, to: &Path) -> Result<(), String> {
    std::fs::create_dir_all(to).map_err(|e| e.to_string())?;

    for entry in std::fs::read_dir(from).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let from_path = entry.path();
        let to_path = to.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir_recursive(&from_path, &to_path)?;
        } else {
            std::fs::copy(&from_path, &to_path).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[derive(Serialize)]
struct GitFileStatus {
    path: String,
    status: String,
}

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

#[tauri::command]
async fn git_diff(root: String, file_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = create_command("git")
            .args(["diff", "HEAD", "--", &file_path])
            .current_dir(&root)
            .output()
            .map_err(|e| format!("failed to run git: {e}"))?;

        if output.status.success() && !output.stdout.is_empty() {
            return Ok(String::from_utf8_lossy(&output.stdout).to_string());
        }

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

#[tauri::command]
async fn git_checkout_file(root: String, file_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = create_command("git")
            .args(["checkout", "HEAD", "--", &file_path])
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

#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    use base64::engine::general_purpose::STANDARD;
    const MAX_BYTES: u64 = 20 * 1024 * 1024;
    let metadata = std::fs::metadata(&path).map_err(|e| format!("failed to stat file: {e}"))?;
    if metadata.len() > MAX_BYTES {
        return Err("File is too large (over 20 MB).".to_string());
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("failed to read file: {e}"))?;
    Ok(STANDARD.encode(&bytes))
}

#[tauri::command]
fn write_file_base64(path: String, contents: String) -> Result<(), String> {
    use base64::engine::general_purpose::STANDARD;
    let bytes = STANDARD
        .decode(&contents)
        .map_err(|e| format!("invalid base64: {e}"))?;
    let target = std::path::Path::new(&path);
    let file_name = target
        .file_name()
        .ok_or_else(|| "invalid file path".to_string())?
        .to_string_lossy();
    let tmp = target.with_file_name(format!(".{file_name}.aether-tmp"));
    std::fs::write(&tmp, &bytes).map_err(|e| format!("failed to write file: {e}"))?;
    std::fs::rename(&tmp, target).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("failed to write file: {e}")
    })
}

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
            read_file_base64,
            write_file_base64,
            list_files,
            search_files,
            create_entry,
            rename_entry,
            delete_entry,
            copy_entry,
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
            git_checkout_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
