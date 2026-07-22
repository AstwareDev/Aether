import DOMPurify from "dompurify";
import { marked } from "marked";
import { monaco } from "./setup";

/** Sanitized HTML for assistant markdown. Never call on user-typed text. */
export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { breaks: true, gfm: true, async: false }) as string;
  return DOMPurify.sanitize(html);
}

const FENCE_ALIAS: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  yml: "yaml",
  md: "markdown",
  "c++": "cpp",
  cs: "csharp",
  rb: "ruby",
  kt: "kotlin",
  ps1: "powershell",
};

let registeredIds: Set<string> | null = null;

/** Map a markdown fence tag to a registered Monaco language id, best-effort. */
function resolveLanguageId(tag: string): string {
  registeredIds ??= new Set(monaco.languages.getLanguages().map((l) => l.id));
  const id = FENCE_ALIAS[tag] ?? tag;
  return registeredIds.has(id) ? id : "plaintext";
}

/**
 * Find `<pre><code class="language-xxx">` blocks inside `container` (the
 * shape `marked` emits for fenced code) and replace their content with
 * Monaco's own `colorize()` output, reusing the editor's already-loaded
 * tokenizers instead of a second syntax-highlighting library.
 */
export async function colorizeCodeBlocks(container: HTMLElement): Promise<void> {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>("pre > code[class^='language-']"));
  await Promise.all(
    blocks.map(async (code) => {
      const tag = code.className.replace(/^language-/, "").trim();
      const langId = resolveLanguageId(tag);
      const text = code.textContent ?? "";
      try {
        const html = await monaco.editor.colorize(text, langId, { tabSize: 2 });
        code.innerHTML = html;
        code.classList.add("aether-ai-colorized");
      } catch {
        // Leave the plain escaped text in place if colorizing fails.
      }
    }),
  );
}
