import { monaco } from "./setup";
import { languageForPath } from "./editorLanguage";
import { extensionOf, readFilesText, type IndexedFile } from "../fs";

const SOURCE_EXTENSIONS = new Set(["js", "jsx", "ts", "tsx", "mjs", "cjs"]);
const MAX_FILES = 3000;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const READ_BATCH_SIZE = 200;

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}

export function toUri(path: string): monaco.Uri {
  return monaco.Uri.file(normalize(path));
}

export function isWorkspaceSourceExtension(path: string): boolean {
  return SOURCE_EXTENSIONS.has(extensionOf(path));
}

// Non-source models can now be displayed by more than one editor group at
// once (split editors), so ownership can't be "whichever CodeEditor instance
// created it" any more — it's refcounted, and only disposed once every
// instance showing it has let go. Source-extension models are exempt: their
// lifecycle is owned entirely by syncWorkspaceModels above.
const refCounts = new Map<string, number>();

export function claimModel(path: string, initialValue: string, language: string): monaco.editor.ITextModel {
  const uri = toUri(path);
  const model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(initialValue, language, uri);
  if (!isWorkspaceSourceExtension(path)) {
    const key = uri.toString();
    refCounts.set(key, (refCounts.get(key) ?? 0) + 1);
  }
  return model;
}

export function releaseModel(path: string): void {
  if (isWorkspaceSourceExtension(path)) return;
  const key = toUri(path).toString();
  const count = (refCounts.get(key) ?? 0) - 1;
  if (count > 0) {
    refCounts.set(key, count);
    return;
  }
  refCounts.delete(key);
  monaco.editor.getModel(toUri(path))?.dispose();
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

let syncToken = 0;

export async function syncWorkspaceModels(files: IndexedFile[]): Promise<void> {
  const token = ++syncToken;
  const current = new Set(
    files.filter((f) => isWorkspaceSourceExtension(f.path)).map((f) => toUri(f.path).toString()),
  );

  for (const model of monaco.editor.getModels()) {
    if (current.has(model.uri.toString())) continue;
    if (!isWorkspaceSourceExtension(model.uri.path)) continue;
    model.dispose();
  }

  let candidates = files.filter((f) => isWorkspaceSourceExtension(f.path) && !monaco.editor.getModel(toUri(f.path)));
  if (candidates.length > MAX_FILES) {
    console.warn(
      `[workspaceModels] ${candidates.length} unindexed source files found; only priming the first ${MAX_FILES} for cross-file IntelliSense.`,
    );
    candidates = candidates.slice(0, MAX_FILES);
  }

  let totalBytes = 0;
  for (const group of chunk(candidates, READ_BATCH_SIZE)) {
    if (token !== syncToken) return;
    const toRead = group.filter((f) => !monaco.editor.getModel(toUri(f.path)));
    if (toRead.length === 0) continue;

    const results = await readFilesText(toRead.map((f) => f.path));
    if (token !== syncToken) return;

    for (const r of results) {
      if (!r.text) continue;
      totalBytes += r.text.length;
      if (totalBytes > MAX_TOTAL_BYTES) {
        console.warn(`[workspaceModels] hit the ${MAX_TOTAL_BYTES}-byte indexing budget; stopping early.`);
        return;
      }
      const uri = toUri(r.path);
      if (monaco.editor.getModel(uri)) continue;
      monaco.editor.createModel(r.text, languageForPath(r.path), uri);
    }
  }
}

function joinRelative(dir: string, spec: string): string {
  const base = normalize(dir);
  const isPosixAbsolute = base.startsWith("/");
  const segments = `${base}/${spec}`.split("/");
  const stack: string[] = [];
  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  return (isPosixAbsolute ? "/" : "") + stack.join("/");
}

const RESOLUTION_SUFFIXES = ["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];

export function resolveWorkspaceImport(fromDir: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = joinRelative(fromDir, specifier);
  for (const suffix of RESOLUTION_SUFFIXES) {
    if (monaco.editor.getModel(toUri(base + suffix))) return base + suffix;
  }
  return null;
}

export function getWorkspaceModelText(path: string): string | null {
  return monaco.editor.getModel(toUri(path))?.getValue() ?? null;
}
