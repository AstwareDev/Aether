export const BROWSER_PREFIX = "browser:";

/**
 * A pane with nothing loaded. Each blank tab gets its own identity so opening a
 * second one does not just re-focus the first.
 */
const BLANK_PREFIX = "about:newtab";
let blankSeq = 0;

export function blankBrowserUrl(): string {
  return `${BLANK_PREFIX}#${++blankSeq}`;
}

export function isBlankBrowserUrl(url: string): boolean {
  return !url || url.startsWith(BLANK_PREFIX);
}

/** A `file:` URL for a path on disk, for "Open in Browser" on an HTML file. */
export function fileUrl(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const withRoot = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `file://${withRoot.split("/").map(encodeURIComponent).join("/")}`;
}

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
  if (!trimmed) return blankBrowserUrl();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (/^localhost(:\d+)?(\/|$)/i.test(trimmed) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(trimmed)) return `https://${trimmed}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

/** Short label for a tab — the host, or the path tail for a deep link. */
export function browserLabel(url: string): string {
  if (isBlankBrowserUrl(url)) return "New Tab";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:") {
      return decodeURIComponent(parsed.pathname.split("/").pop() || "") || "File";
    }
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return url || "Browser";
  }
}
