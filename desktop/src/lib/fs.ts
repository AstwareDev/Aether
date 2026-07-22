import { invoke } from "@tauri-apps/api/core";
import type { DirEntry, FileTextResult, IndexedFile } from "../types";
export type { DirEntry, FileTextResult, IndexedFile } from "../types";

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** List the immediate children of a directory (dirs first, then alphabetical). */
export async function readDir(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("read_dir", { path });
}

/** Read a text file's contents. Throws for binary / oversized files. */
export async function readFileText(path: string): Promise<string> {
  return invoke<string>("read_file_text", { path });
}

/** Write text back to a file on disk. */
export async function writeFileText(path: string, contents: string): Promise<void> {
  return invoke("write_file_text", { path, contents });
}

/** Batch-read many files' text in one IPC round-trip (background indexing). */
export async function readFilesText(paths: string[]): Promise<FileTextResult[]> {
  const results = await invoke<{ path: string; text: string | null }[]>("read_files_text", { paths });
  return results.map((r) => ({ path: r.path, text: r.text ?? undefined }));
}

/** Recursively index files under `root` (gitignore-aware) for quick-open. */
export async function listFiles(root: string): Promise<IndexedFile[]> {
  return invoke<IndexedFile[]>("list_files", { root });
}

/** Create an empty file (isDir=false) or a directory (isDir=true). */
export async function createEntry(path: string, isDir: boolean): Promise<void> {
  return invoke("create_entry", { path, isDir });
}

/** Rename / move a file or directory. */
export async function renameEntry(from: string, to: string): Promise<void> {
  return invoke("rename_entry", { from, to });
}

/** Permanently delete a file or directory. */
export async function deleteEntry(path: string): Promise<void> {
  return invoke("delete_entry", { path });
}

/** The final path segment, tolerant of both `/` and `\` separators. */
export function baseName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] || normalized;
}

/** Lowercased file extension without the dot (e.g. "tsx"), or "". */
export function extensionOf(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Parent directory of a path (both separators tolerated). */
export function dirName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const idx = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return idx > 0 ? normalized.slice(0, idx) : normalized;
}

/** Join a directory and child name, preserving the directory's separator style. */
export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return `${dir.replace(/[/\\]+$/, "")}${sep}${name}`;
}

/** Open the OS file manager at `path`, selecting the item. */
export async function revealInExplorer(path: string): Promise<void> {
  return invoke("reveal_in_explorer", { path });
}

/** Open a new OS terminal window rooted at `dir`. */
export async function openInTerminal(dir: string): Promise<void> {
  return invoke("open_in_terminal", { dir });
}
