import { invoke } from "@tauri-apps/api/core";
import type { DirEntry, FileTextResult, IndexedFile } from "../types";
export type { DirEntry, FileTextResult, IndexedFile } from "../types";

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function readFileBase64(path: string): Promise<string> {
  return invoke<string>("read_file_base64", { path });
}

export async function writeFileBase64(path: string, contents: string): Promise<void> {
  return invoke("write_file_base64", { path, contents });
}

export async function readDir(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("read_dir", { path });
}

export async function readFileText(path: string): Promise<string> {
  return invoke<string>("read_file_text", { path });
}

export async function writeFileText(path: string, contents: string): Promise<void> {
  return invoke("write_file_text", { path, contents });
}

export async function readFilesText(paths: string[]): Promise<FileTextResult[]> {
  const results = await invoke<{ path: string; text: string | null }[]>("read_files_text", { paths });
  return results.map((r) => ({ path: r.path, text: r.text ?? undefined }));
}

export async function listFiles(root: string): Promise<IndexedFile[]> {
  return invoke<IndexedFile[]>("list_files", { root });
}

export async function createEntry(path: string, isDir: boolean): Promise<void> {
  return invoke("create_entry", { path, isDir });
}

export async function renameEntry(from: string, to: string): Promise<void> {
  return invoke("rename_entry", { from, to });
}

export async function deleteEntry(path: string): Promise<void> {
  return invoke("delete_entry", { path });
}

export async function copyEntry(from: string, to: string): Promise<void> {
  return invoke("copy_entry", { from, to });
}

export interface CopiedEntry {
  /** Empty when the entry was materialised rather than copied, e.g. a pasted image. */
  from: string;
  to: string;
}

export interface ClipboardProbe {
  kind: "files" | "image" | "none";
  paths: string[];
}

/** Copies anything on disk into `dir`, renaming around name collisions. */
export async function copyIntoDir(sources: string[], dir: string): Promise<CopiedEntry[]> {
  return invoke<CopiedEntry[]>("copy_into_dir", { sources, dir });
}

export async function clipboardProbe(): Promise<ClipboardProbe> {
  return invoke<ClipboardProbe>("clipboard_probe");
}

export async function clipboardPasteInto(dir: string): Promise<CopiedEntry[]> {
  return invoke<CopiedEntry[]>("clipboard_paste_into", { dir });
}

export async function clipboardWritePaths(paths: string[]): Promise<void> {
  return invoke("clipboard_write_paths", { paths });
}

export function baseName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] || normalized;
}

export function extensionOf(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function dirName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const idx = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return idx > 0 ? normalized.slice(0, idx) : normalized;
}

export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return `${dir.replace(/[/\\]+$/, "")}${sep}${name}`;
}

export async function revealInExplorer(path: string): Promise<void> {
  return invoke("reveal_in_explorer", { path });
}

export async function openInTerminal(dir: string): Promise<void> {
  return invoke("open_in_terminal", { dir });
}

export interface ToolExecResult {
  output: string;
  error?: string;
}

export async function execTool(
  name: string,
  input: Record<string, unknown>,
  root: string,
): Promise<ToolExecResult> {
  return invoke<ToolExecResult>("exec_tool", { name, input, root });
}
