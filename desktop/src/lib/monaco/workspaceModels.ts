import { monaco } from "./setup";
import { languageForPath } from "./editorLanguage";
import { extensionOf, readFilesText, type IndexedFile } from "../fs";

// ---------------------------------------------------------------------------
// Background Monaco models for every workspace source file, not just open
// tabs. Without this, Monaco's TS/JS language service only ever "sees" the
// handful of files a user happens to have open, so it can't offer a
// cross-file auto-import (e.g. typing `<Butto` in Home.jsx won't suggest
// importing Button.jsx unless Button.jsx also happens to be open). Once a
// file has a model — background or tab — `CodeEditor.tsx` reuses the exact
// same instance (`getModel(uri) ?? createModel(...)`), so an open tab always
// edits the one true model and this module never fights it for ownership.
// ---------------------------------------------------------------------------

const SOURCE_EXTENSIONS = new Set(["js", "jsx", "ts", "tsx", "mjs", "cjs"]);
const MAX_FILES = 3000;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const READ_BATCH_SIZE = 200;

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Normalize a Tauri fs path into the forward-slash form monaco.Uri.file expects. */
export function toUri(path: string): monaco.Uri {
  return monaco.Uri.file(normalize(path));
}

export function isWorkspaceSourceExtension(path: string): boolean {
  return SOURCE_EXTENSIONS.has(extensionOf(path));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

let syncToken = 0;

/**
 * Reconcile background models against a fresh (gitignore-aware) workspace
 * file listing: dispose+drop any source model whose file is no longer in
 * the listing (deleted, or renamed away), then create models for source
 * files that don't have one yet. A single full resync against the listing
 * handles create/rename/delete alike, rather than needing bespoke handling
 * for each — the listing is already refreshed after every mutation (see
 * `Workspace.tsx`'s `reloadIndex`), so this just needs to be called there.
 *
 * Disposing a model that's currently attached to a live editor is safe —
 * Monaco's editor widget listens for the model's dispose and detaches
 * itself — but as a courtesy this only ever prunes models whose backing
 * file is verifiably gone, never ones mid-edit.
 *
 * Calls are cheap to fire in quick succession: a stale call (an older
 * listing resolving after a newer one started) is dropped via `syncToken`
 * so it can't resurrect a model a newer call already pruned.
 */
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
      if (monaco.editor.getModel(uri)) continue; // a tab opened it while this batch was in flight
      monaco.editor.createModel(r.text, languageForPath(r.path), uri);
    }
  }
}

// ---------------------------------------------------------------------------
// Related-file lookup for the AI context builder (see lib/monaco/aiEdit.ts).
// ---------------------------------------------------------------------------

function joinRelative(dir: string, spec: string): string {
  const base = normalize(dir);
  // Windows-style paths (from Tauri's fs APIs) always start with a drive
  // letter segment (e.g. "D:"), never a bare "/" — but this is a
  // cross-platform Tauri app, so a POSIX-absolute `dir` (macOS/Linux) needs
  // its leading root preserved explicitly, since splitting on "/" turns it
  // into an empty first segment that the loop below otherwise discards.
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

/** Resolve a relative import specifier (from `fromDir`) to a modeled workspace file's path, if any. */
export function resolveWorkspaceImport(fromDir: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null; // bare specifiers resolve into node_modules, not the workspace
  const base = joinRelative(fromDir, specifier);
  for (const suffix of RESOLUTION_SUFFIXES) {
    if (monaco.editor.getModel(toUri(base + suffix))) return base + suffix;
  }
  return null;
}

/** Live text of a workspace-modeled file (background or open tab), if one exists. */
export function getWorkspaceModelText(path: string): string | null {
  return monaco.editor.getModel(toUri(path))?.getValue() ?? null;
}
