import type { DirEntry, TreeRow, TreeSegment } from "../../types";

export const ROW_HEIGHT = 22;
export const INDENT = 12;
export const BASE_PADDING = 10;

/** Canonical key for path comparison across the OS separator split. */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function isWithinOrEqual(path: string, ancestor: string): boolean {
  const p = normalizePath(path);
  const a = normalizePath(ancestor);
  return p === a || p.startsWith(a + "/");
}

/**
 * Ancestor directories of `path` below `root`, outermost first. Slices the
 * original string so the results keep the OS separators the expansion set and
 * directory cache are keyed by.
 */
export function ancestorsOf(path: string, root: string): string[] {
  const rootLength = root.replace(/[/\\]+$/, "").length;
  const out: string[] = [];
  let current = path.replace(/[/\\]+$/, "");
  for (;;) {
    const cut = Math.max(current.lastIndexOf("/"), current.lastIndexOf("\\"));
    if (cut < 0) break;
    current = current.slice(0, cut);
    if (current.length <= rootLength) break;
    out.push(current);
  }
  return out.reverse();
}

/**
 * Collapses runs of directories that contain nothing but a single subdirectory
 * into one row (VSCode's `explorer.compactFolders`). Chains only form from
 * directories already in the cache, so the loader must prefetch single-child
 * folders for a chain to appear.
 */
function chainOf(
  entry: DirEntry,
  dirs: ReadonlyMap<string, DirEntry[]>,
  compact: boolean,
): TreeSegment[] {
  const segments: TreeSegment[] = [{ name: entry.name, path: entry.path }];
  if (!compact) return segments;
  let tail = entry;
  for (;;) {
    const children = dirs.get(tail.path);
    if (!children || children.length !== 1 || !children[0].is_dir) break;
    tail = children[0];
    segments.push({ name: tail.name, path: tail.path });
    if (segments.length > 32) break;
  }
  return segments;
}

export interface FlattenOptions {
  root: string;
  dirs: ReadonlyMap<string, DirEntry[]>;
  expanded: ReadonlySet<string>;
  compact: boolean;
}

/** Projects the loaded directory cache into the visible, ordered row list. */
export function flattenTree({ root, dirs, expanded, compact }: FlattenOptions): TreeRow[] {
  const rows: TreeRow[] = [];

  const walk = (dirPath: string, depth: number) => {
    const entries = dirs.get(dirPath);
    if (!entries) return;
    for (const entry of entries) {
      if (!entry.is_dir) {
        rows.push({
          key: entry.path,
          path: entry.path,
          name: entry.name,
          isDir: false,
          depth,
          parentPath: dirPath,
          segments: null,
          expanded: false,
        });
        continue;
      }
      const segments = chainOf(entry, dirs, compact);
      const tail = segments[segments.length - 1];
      const open = expanded.has(tail.path);
      rows.push({
        key: entry.path,
        path: tail.path,
        name: segments.map((s) => s.name).join("/"),
        isDir: true,
        depth,
        parentPath: dirPath,
        segments: segments.length > 1 ? segments : null,
        expanded: open,
      });
      if (open) walk(tail.path, depth + 1);
    }
  };

  walk(root, 0);
  return rows;
}

/** Directory a new sibling of `row` would land in. */
export function targetDirOf(row: TreeRow | null, root: string): string {
  if (!row) return root;
  return row.isDir ? row.path : row.parentPath;
}

export function entriesEqual(a: DirEntry[] | undefined, b: DirEntry[]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].path !== b[i].path || a[i].is_dir !== b[i].is_dir) return false;
  }
  return true;
}
