export const BROWSER_PREFIX = "browser:";

export const DEFAULT_BROWSER_URL = "http://localhost:1420";

export function isBrowserPath(path: string): boolean {
  return path.startsWith(BROWSER_PREFIX);
}

export function browserPath(url: string): string {
  return BROWSER_PREFIX + url;
}

export function urlFromBrowserPath(path: string): string {
  return path.slice(BROWSER_PREFIX.length);
}

/** Accepts what a user actually types — `localhost:3000`, `example.com`, a search phrase. */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_BROWSER_URL;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (/^localhost(:\d+)?(\/|$)/i.test(trimmed) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(trimmed)) return `https://${trimmed}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

/** Short label for a tab — the host, or the path tail for a deep link. */
export function browserLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return url || "Browser";
  }
}
