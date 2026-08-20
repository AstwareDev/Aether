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

/// Next free name in `dir` for `name`, following the `file copy`, `file copy 2`
/// convention Explorer and Finder both use.
fn unique_destination(dir: &Path, name: &str) -> std::path::PathBuf {
    let direct = dir.join(name);
    if !direct.exists() {
        return direct;
    }
    let as_path = Path::new(name);
    let stem = as_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| name.to_string());
    let ext = as_path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();

    for n in 1..1000 {
        let attempt = if n == 1 {
            format!("{stem} copy{ext}")
        } else {
            format!("{stem} copy {n}{ext}")
        };
        let candidate = dir.join(attempt);
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{stem} copy {}{ext}", std::process::id()))
}

#[derive(Serialize)]
struct CopiedEntry {
    from: String,
    to: String,
}

/// Copies files and folders from anywhere on disk into `dir`, renaming around
/// collisions. Backs paste, drag-and-drop from the OS, and in-app copy.
#[tauri::command]
async fn copy_into_dir(sources: Vec<String>, dir: String) -> Result<Vec<CopiedEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || copy_into_dir_blocking(sources, &dir))
        .await
        .map_err(|e| format!("task failed: {e}"))?
}

fn copy_into_dir_blocking(sources: Vec<String>, dir: &str) -> Result<Vec<CopiedEntry>, String> {
    let dir_path = Path::new(dir);
    if !dir_path.is_dir() {
        return Err("The destination is not a folder.".to_string());
    }

    let mut copied = Vec::new();
    let mut failures = Vec::new();

    for source in sources {
        let from = Path::new(&source);
        let name = match from.file_name() {
            Some(n) => n.to_string_lossy().to_string(),
            None => continue,
        };
        // Copying a folder into itself or one of its descendants would recurse.
        if dir_path.starts_with(from) {
            continue;
        }
        let to = unique_destination(dir_path, &name);
        let outcome = match std::fs::symlink_metadata(from) {
            Ok(meta) if meta.is_dir() => copy_dir_recursive(from, &to),
            Ok(_) => std::fs::copy(from, &to).map(|_| ()).map_err(|e| e.to_string()),
            Err(e) => Err(e.to_string()),
        };
        match outcome {
            Ok(()) => copied.push(CopiedEntry {
                from: source,
                to: to.to_string_lossy().to_string(),
            }),
            Err(e) => failures.push(format!("{name}: {e}")),
        }
    }

    if copied.is_empty() && !failures.is_empty() {
        return Err(failures.join("; "));
    }
    Ok(copied)
}

#[derive(Serialize)]
struct ClipboardProbe {
    kind: &'static str,
    paths: Vec<String>,
}

#[cfg(windows)]
mod os_clipboard {
    use clipboard_win::{formats, Clipboard, Setter};

    pub fn file_list() -> Vec<String> {
        clipboard_win::get_clipboard(formats::FileList).unwrap_or_default()
    }

    pub fn set_file_list(paths: &[String]) -> Result<(), String> {
        let _owned = Clipboard::new_attempts(10).map_err(|e| e.to_string())?;
        formats::FileList
            .write_clipboard(&paths)
            .map_err(|e| e.to_string())
    }

    /// PNG first — browsers and the Snipping Tool publish it, and it survives
    /// round-tripping better than the DIB the bitmap format hands back.
    pub fn image() -> Option<(&'static str, Vec<u8>)> {
        if let Some(png) = clipboard_win::register_format("PNG") {
            if clipboard_win::is_format_avail(png.get()) {
                if let Ok(bytes) = clipboard_win::get_clipboard(formats::RawData(png.get())) {
                    return Some(("png", bytes));
                }
            }
        }
        if clipboard_win::is_format_avail(formats::CF_DIB) {
            if let Ok(bytes) = clipboard_win::get_clipboard(formats::Bitmap) {
                return Some(("bmp", bytes));
            }
        }
        None
    }
}

#[cfg(not(windows))]
mod os_clipboard {
    pub fn file_list() -> Vec<String> {
        Vec::new()
    }

    pub fn set_file_list(_paths: &[String]) -> Result<(), String> {
        Ok(())
    }

    pub fn image() -> Option<(&'static str, Vec<u8>)> {
        None
    }
}

/// What a paste would produce, so the explorer can decide between the system
/// clipboard and its own cut/copy buffer before acting.
#[tauri::command]
async fn clipboard_probe() -> Result<ClipboardProbe, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let paths = os_clipboard::file_list();
        if !paths.is_empty() {
            return ClipboardProbe {
                kind: "files",
                paths,
            };
        }
        if os_clipboard::image().is_some() {
            return ClipboardProbe {
                kind: "image",
                paths: Vec::new(),
            };
        }
        ClipboardProbe {
            kind: "none",
            paths: Vec::new(),
        }
    })
    .await
    .map_err(|e| format!("task failed: {e}"))
}

/// Pastes the system clipboard into `dir`: copied files and folders land as
/// copies, a copied image is written out as a new file.
#[tauri::command]
async fn clipboard_paste_into(dir: String) -> Result<Vec<CopiedEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let sources = os_clipboard::file_list();
        if !sources.is_empty() {
            return copy_into_dir_blocking(sources, &dir);
        }

        let (extension, bytes) = os_clipboard::image().ok_or("The clipboard has no files.")?;
        let dir_path = Path::new(&dir);
        if !dir_path.is_dir() {
            return Err("The destination is not a folder.".to_string());
        }
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let to = unique_destination(dir_path, &format!("Pasted image {stamp}.{extension}"));
        std::fs::write(&to, bytes).map_err(|e| e.to_string())?;
        Ok(vec![CopiedEntry {
            from: String::new(),
            to: to.to_string_lossy().to_string(),
        }])
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?
}

/// Publishes an in-app selection to the system clipboard so it can be pasted
/// into Explorer and other applications.
#[tauri::command]
async fn clipboard_write_paths(paths: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || os_clipboard::set_file_list(&paths))
        .await
        .map_err(|e| format!("task failed: {e}"))?
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

/// Whole staged changeset in one call, so commit-message generation sees every
/// file together instead of stitching per-file diffs.
#[tauri::command]
async fn git_diff_staged(root: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = create_command("git")
            .args(["diff", "--cached"])
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
async fn git_push(root: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = create_command("git")
            .args(["push"])
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
async fn git_push_set_upstream(root: String, branch: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = create_command("git")
            .args(["push", "--set-upstream", "origin", &branch])
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
    author_email: String,
    date: String,
    message: String,
    refs: String,
    parents: Vec<String>,
}

// Unit separator keeps `|` inside subjects and ref names from corrupting the split.
const LOG_FORMAT: &str = "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1f%s";

#[tauri::command]
async fn git_log(root: String, limit: Option<u32>) -> Result<Vec<GitCommit>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let max_count = format!("--max-count={}", limit.unwrap_or(200).clamp(1, 5000));
        let output = create_command("git")
            .args(["log", &max_count, "--all", "--topo-order", LOG_FORMAT])
            .current_dir(&root)
            .output()
            .map_err(|e| format!("failed to run git: {e}"))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut commits = Vec::new();
        for line in stdout.lines() {
            let parts: Vec<&str> = line.split('\u{1f}').collect();
            if parts.len() < 8 {
                continue;
            }
            commits.push(GitCommit {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                author: parts[2].to_string(),
                author_email: parts[3].to_string(),
                date: parts[4].to_string(),
                parents: parts[5]
                    .split_whitespace()
                    .map(|s| s.to_string())
                    .collect(),
                refs: parts[6].to_string(),
                message: parts[7].to_string(),
            });
        }
        Ok(commits)
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?
}

#[tauri::command]
async fn git_remote_url(root: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = create_command("git")
            .args(["config", "--get", "remote.origin.url"])
            .current_dir(&root)
            .output()
            .map_err(|e| format!("failed to run git: {e}"))?;

        if !output.status.success() {
            return Err("No remote origin found".to_string());
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
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

#[derive(Serialize)]
struct ToolExecResult {
    output: String,
    error: Option<String>,
}

/// Resolves an agent-supplied path against the workspace root and rejects
/// anything that escapes it, so a hallucinated `../../` cannot reach outside
/// the project. Canonicalized where possible because `..` segments only
/// resolve correctly against a real filesystem.
fn resolve_in_root(root: &str, rel: &str) -> Result<std::path::PathBuf, String> {
    let root_path = Path::new(root);
    let root_canon = root_path
        .canonicalize()
        .unwrap_or_else(|_| root_path.to_path_buf());

    let candidate = Path::new(rel);
    let joined = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        root_canon.join(candidate)
    };

    let resolved = joined.canonicalize().unwrap_or(joined);
    if !resolved.starts_with(&root_canon) {
        return Err(format!("path escapes the workspace: {rel}"));
    }
    Ok(resolved)
}

const MAX_TOOL_OUTPUT: usize = 24_000;
const MAX_SEARCH_MATCHES: usize = 60;

fn truncate_output(text: String, note: &str) -> String {
    match text.char_indices().nth(MAX_TOOL_OUTPUT) {
        Some((idx, _)) => format!("{}\n… output truncated ({note})", &text[..idx]),
        None => text,
    }
}

/// Filename glob supporting `*` and `?`. Full-path globbing is unnecessary —
/// callers scope the walk with `path` instead.
fn glob_matches(pattern: &str, name: &str) -> bool {
    fn inner(p: &[u8], n: &[u8]) -> bool {
        match p.first() {
            None => n.is_empty(),
            Some(b'*') => inner(&p[1..], n) || (!n.is_empty() && inner(p, &n[1..])),
            Some(b'?') => !n.is_empty() && inner(&p[1..], &n[1..]),
            Some(c) => !n.is_empty() && n[0].eq_ignore_ascii_case(c) && inner(&p[1..], &n[1..]),
        }
    }
    inner(pattern.as_bytes(), name.as_bytes())
}

fn walk_workspace(root: &std::path::Path) -> ignore::Walk {
    WalkBuilder::new(root)
        .hidden(false)
        .git_ignore(true)
        .filter_entry(|e| e.file_name() != ".git" && e.file_name() != "node_modules")
        .build()
}

fn rel_display(path: &std::path::Path, base: &std::path::Path) -> String {
    path.strip_prefix(base)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

#[tauri::command]
async fn exec_tool(
    name: String,
    input: serde_json::Value,
    root: String,
) -> Result<ToolExecResult, String> {
    tauri::async_runtime::spawn_blocking(move || exec_tool_blocking(&name, &input, &root))
        .await
        .map_err(|e| format!("task failed: {e}"))?
}

fn exec_tool_blocking(
    name: &str,
    input: &serde_json::Value,
    root: &str,
) -> Result<ToolExecResult, String> {
    let str_arg = |key: &str| input.get(key).and_then(|v| v.as_str());
    let usize_arg = |key: &str| input.get(key).and_then(|v| v.as_u64()).map(|n| n as usize);
    let ok = |output: String| {
        Ok(ToolExecResult {
            output,
            error: None,
        })
    };

    match name {
        "read_file" => {
            let rel = str_arg("path").ok_or("missing path")?;
            let path = resolve_in_root(root, rel)?;
            let content =
                std::fs::read_to_string(&path).map_err(|e| format!("failed to read {rel}: {e}"))?;

            let lines: Vec<&str> = content.lines().collect();
            let start = usize_arg("start_line").unwrap_or(1).max(1) - 1;
            let end = usize_arg("end_line").unwrap_or(lines.len()).min(lines.len());
            if start >= lines.len() {
                return Ok(ToolExecResult {
                    output: String::new(),
                    error: Some(format!(
                        "start_line {} is past end of file ({} lines)",
                        start + 1,
                        lines.len()
                    )),
                });
            }

            let numbered = lines[start..end]
                .iter()
                .enumerate()
                .map(|(i, l)| format!("{}: {}", start + i + 1, l))
                .collect::<Vec<_>>()
                .join("\n");

            ok(truncate_output(numbered, "narrow the line range"))
        }
        "list_directory" => {
            let rel = str_arg("path").unwrap_or(".");
            let dir = resolve_in_root(root, rel)?;
            let entries =
                std::fs::read_dir(&dir).map_err(|e| format!("failed to list {rel}: {e}"))?;

            let mut items: Vec<String> = entries
                .flatten()
                .filter(|e| e.file_name() != ".git" && e.file_name() != "node_modules")
                .take(400)
                .map(|entry| {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        format!("{name}/")
                    } else {
                        name
                    }
                })
                .collect();
            items.sort();

            ok(items.join("\n"))
        }
        "search_code" => {
            let query = str_arg("query").ok_or("missing query")?;
            let re = regex::RegexBuilder::new(query)
                .case_insensitive(
                    input
                        .get("ignore_case")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                )
                .build()
                .map_err(|e| format!("invalid regex: {e}"))?;

            let search_root = resolve_in_root(root, str_arg("path").unwrap_or("."))?;
            let glob = str_arg("glob").filter(|g| !g.is_empty());

            let mut matches: Vec<String> = Vec::new();
            'walk: for entry in walk_workspace(&search_root).flatten() {
                if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                    continue;
                }
                let path = entry.path();
                if let Some(pattern) = glob {
                    let name = path.file_name().unwrap_or_default().to_string_lossy();
                    if !glob_matches(pattern, &name) {
                        continue;
                    }
                }
                let Ok(text) = std::fs::read_to_string(path) else {
                    continue;
                };
                let rel = rel_display(path, &search_root);
                for (i, line) in text.lines().enumerate() {
                    if re.is_match(line) {
                        matches.push(format!("{}:{}: {}", rel, i + 1, line.trim()));
                        if matches.len() >= MAX_SEARCH_MATCHES {
                            break 'walk;
                        }
                    }
                }
            }

            ok(if matches.is_empty() {
                "No matches found.".to_string()
            } else {
                matches.join("\n")
            })
        }
        "find_files" => {
            let pattern = str_arg("pattern").ok_or("missing pattern")?;
            let search_root = resolve_in_root(root, str_arg("path").unwrap_or("."))?;

            let mut found: Vec<String> = walk_workspace(&search_root)
                .flatten()
                .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
                .filter(|e| glob_matches(pattern, &e.file_name().to_string_lossy()))
                .take(200)
                .map(|e| rel_display(e.path(), &search_root))
                .collect();
            found.sort();

            ok(if found.is_empty() {
                "No files matched.".to_string()
            } else {
                found.join("\n")
            })
        }
        other => Err(format!("unknown tool: {other}")),
    }
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
            copy_into_dir,
            clipboard_probe,
            clipboard_paste_into,
            clipboard_write_paths,
            ai::ai_complete,
            ai::ai_list_models,
            exec_tool,
            terminal::pty_spawn,
            terminal::pty_write,
            terminal::pty_resize,
            terminal::pty_kill,
            reveal_in_explorer,
            open_in_terminal,
            git_status,
            git_diff,
            git_diff_staged,
            git_show,
            git_log,
            git_remote_url,
            git_stage_all,
            git_commit,
            git_branch,
            git_checkout_file,
            git_push,
            git_push_set_upstream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
