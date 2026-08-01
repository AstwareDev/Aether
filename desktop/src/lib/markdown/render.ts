import { Marked } from "marked";

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Markdown to HTML for the preview and rich-text views.
 *
 * Images render with their href parked in `data-md-src` and no `src`, so the
 * async loader in ./images can fill it in and the rich-text editor can
 * serialize back to the author's original path rather than a blob URL.
 *
 * This uses its own `Marked` instance on purpose: the previous code called the
 * global `marked.setOptions`, which leaked a document-specific image renderer
 * into every other caller, including AI chat rendering.
 */
export function renderDocument(markdown: string): string {
  const md = new Marked({ gfm: true, breaks: true });

  md.use({
    renderer: {
      image(token) {
        const alt = escapeAttr(token.text ?? "");
        const title = token.title ? ` title="${escapeAttr(token.title)}"` : "";
        return `<img data-md-src="${escapeAttr(token.href ?? "")}" alt="${alt}"${title} />`;
      },
      link(token) {
        const href = escapeAttr(token.href ?? "");
        const title = token.title ? ` title="${escapeAttr(token.title)}"` : "";
        const external = /^https?:/i.test(token.href ?? "");
        const rel = external ? ` target="_blank" rel="noopener noreferrer"` : "";
        return `<a href="${href}"${title}${rel}>${this.parser.parseInline(token.tokens ?? [])}</a>`;
      },
    },
  });

  return md.parse(markdown, { async: false }) as string;
}
