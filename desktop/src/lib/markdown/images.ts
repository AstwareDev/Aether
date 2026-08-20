import { dirName, extensionOf, joinPath, readFileBase64 } from "../fs";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  avif: "image/avif",
};

/** Already a URL the webview can load on its own. */
export function isDirectUrl(href: string): boolean {
  return /^(https?:|data:|blob:)/i.test(href);
}

function isAbsolute(href: string): boolean {
  return /^([a-zA-Z]:[\\/]|[\\/]{1,2})/.test(href);
}

/**
 * Turn a markdown image href into an absolute filesystem path. Relative hrefs
 * resolve against the document, and `%20`-style escapes are decoded because
 * markdown authors write URLs while the filesystem wants raw names.
 */
export function resolveImagePath(href: string, docPath: string): string {
  let raw = href.replace(/[?#].*$/, "").trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Leave a malformed escape sequence as written.
  }
  return isAbsolute(raw) ? raw : joinPath(dirName(docPath), raw);
}

const cache = new Map<string, Promise<string>>();

/**
 * The asset protocol is not enabled for this app, so `convertFileSrc` URLs never
 * resolve. Image bytes come through the Rust command and become blob URLs,
 * cached per absolute path so a document that repeats an image reads it once.
 */
export function loadImageUrl(absPath: string): Promise<string> {
  const hit = cache.get(absPath);
  if (hit) return hit;

  const pending = readFileBase64(absPath).then((b64) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const type = MIME[extensionOf(absPath)] ?? "application/octet-stream";
    return URL.createObjectURL(new Blob([bytes], { type }));
  });

  cache.set(absPath, pending);
  pending.catch(() => cache.delete(absPath));
  return pending;
}

/**
 * Display URL for an image src in the rich-text editor. Remote and inline
 * sources pass through; local paths become blob URLs. A failure returns the
 * original src so the node keeps its author-written path and the editor shows
 * its own broken-image affordance rather than throwing.
 *
 * This is display-only: MDXEditor serializes the node's stored src, never this.
 */
export async function previewImageSrc(src: string, docPath: string): Promise<string> {
  if (!src || isDirectUrl(src)) return src;
  try {
    return await loadImageUrl(resolveImagePath(src, docPath));
  } catch {
    return src;
  }
}

function markBroken(img: HTMLImageElement, href: string): void {
  const fallback = document.createElement("span");
  fallback.className = "aether-md-broken";
  fallback.dataset.mdSrc = href;
  const alt = img.getAttribute("alt");
  fallback.textContent = alt ? `Image not found: ${alt} — ${href}` : `Image not found — ${href}`;
  img.replaceWith(fallback);
}

/**
 * Fill in `src` for every image the renderer left deferred. Failures degrade to
 * an inline note instead of a broken-image glyph, and the walk never throws.
 */
export async function hydrateImages(container: HTMLElement, docPath: string): Promise<void> {
  const images = Array.from(container.querySelectorAll<HTMLImageElement>("img[data-md-src]"));

  await Promise.allSettled(
    images.map(async (img) => {
      const href = img.dataset.mdSrc ?? "";
      if (!href) {
        markBroken(img, href);
        return;
      }
      if (isDirectUrl(href)) {
        img.src = href;
        return;
      }
      try {
        img.src = await loadImageUrl(resolveImagePath(href, docPath));
      } catch {
        markBroken(img, href);
      }
    }),
  );
}
