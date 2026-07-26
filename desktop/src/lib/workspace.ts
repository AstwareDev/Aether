import type { IndexedFile } from "../types";

/**
 * Workspace root and file index, shared with the inline agent so it can resolve
 * tool paths and describe project structure without re-walking the filesystem.
 */
let root = "";
let files: IndexedFile[] = [];

export function setWorkspaceContext(nextRoot: string, nextFiles: IndexedFile[]): void {
  root = nextRoot;
  files = nextFiles;
}

export function getWorkspaceRoot(): string {
  return root;
}

export function toRelativePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = root.replace(/\\/g, "/").replace(/\/+$/, "");
  if (base && normalized.toLowerCase().startsWith(`${base.toLowerCase()}/`)) {
    return normalized.slice(base.length + 1);
  }
  return normalized;
}

const MAX_TREE_ENTRIES = 60;

/**
 * Compact directory-level map of the workspace: the directories that hold the
 * most files, with a few representative entries each. Cheaper for the model to
 * read than a flat list of thousands of paths, and enough to aim its tools.
 */
export function buildProjectTree(currentPath?: string): string {
  if (files.length === 0) return "";

  const byDir = new Map<string, string[]>();
  for (const f of files) {
    const rel = f.rel.replace(/\\/g, "/");
    const slash = rel.lastIndexOf("/");
    const dir = slash === -1 ? "." : rel.slice(0, slash);
    const name = slash === -1 ? rel : rel.slice(slash + 1);
    const bucket = byDir.get(dir);
    if (bucket) bucket.push(name);
    else byDir.set(dir, [name]);
  }

  const currentRel = currentPath ? toRelativePath(currentPath) : "";
  const currentDir = currentRel.includes("/")
    ? currentRel.slice(0, currentRel.lastIndexOf("/"))
    : ".";

  const dirs = [...byDir.entries()]
    .sort((a, b) => {
      if (a[0] === currentDir) return -1;
      if (b[0] === currentDir) return 1;
      return b[1].length - a[1].length || a[0].localeCompare(b[0]);
    })
    .slice(0, MAX_TREE_ENTRIES);

  const lines = dirs.map(([dir, names]) => {
    const shown = names.slice(0, 6).join(", ");
    const more = names.length > 6 ? `, +${names.length - 6} more` : "";
    return `  ${dir}/ (${names.length}): ${shown}${more}`;
  });

  return `PROJECT STRUCTURE (${files.length} files):\n${lines.join("\n")}`;
}
