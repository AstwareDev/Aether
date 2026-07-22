const STORAGE_KEY = "aether:recentFolders";
const LAST_PROJECT_KEY = "aether:lastProject";
const MAX_RECENT = 8;

export function getRecentFolders(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

export function addRecentFolder(path: string): void {
  const existing = getRecentFolders().filter((p) => p !== path);
  const next = [path, ...existing].slice(0, MAX_RECENT);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function removeRecentFolder(path: string): void {
  const next = getRecentFolders().filter((p) => p !== path);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function folderName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] || normalized;
}

export function getLastProject(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function setLastProject(path: string | null): void {
  try {
    if (path === null) {
      localStorage.removeItem(LAST_PROJECT_KEY);
    } else {
      localStorage.setItem(LAST_PROJECT_KEY, path);
    }
  } catch {
    // ignore
  }
}
