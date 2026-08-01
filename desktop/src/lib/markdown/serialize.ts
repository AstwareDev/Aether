const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "UL",
  "OL",
  "LI",
  "BLOCKQUOTE",
  "PRE",
  "TABLE",
  "HR",
]);

/** Characters that would start a new block if they led a line. */
function escapeText(text: string): string {
  return text
    .replace(/([\\`*_[\]])/g, "\\$1")
    .replace(/^(\s*)(#{1,6})(\s)/gm, "$1\\$2$3")
    .replace(/^(\s*)([-+])(\s)/gm, "$1\\$2$3")
    .replace(/^(\s*)(\d+)\.(\s)/gm, "$1$2\\.$3")
    .replace(/^(\s*)>/gm, "$1\\>");
}

function isBlock(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as Element).tagName);
}

/** Inline content of a node: emphasis, code, links, images, breaks. */
function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    // Layout whitespace in the contenteditable tree is not content.
    return escapeText((node.textContent ?? "").replace(/\s*\n\s*/g, " "));
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const kids = () => Array.from(el.childNodes).map(inline).join("");

  switch (el.tagName) {
    case "BR":
      return "\n";
    case "STRONG":
    case "B": {
      const inner = kids().trim();
      return inner ? `**${inner}**` : "";
    }
    case "EM":
    case "I": {
      const inner = kids().trim();
      return inner ? `*${inner}*` : "";
    }
    case "DEL":
    case "S":
    case "STRIKE": {
      const inner = kids().trim();
      return inner ? `~~${inner}~~` : "";
    }
    case "CODE": {
      // Code spans are literal: no escaping inside, and the fence grows to
      // outlast any run of backticks in the content.
      const raw = el.textContent ?? "";
      const longest = Math.max(0, ...(raw.match(/`+/g) ?? []).map((r) => r.length));
      const fence = "`".repeat(longest + 1);
      const pad = raw.startsWith("`") || raw.endsWith("`") ? " " : "";
      return raw ? `${fence}${pad}${raw}${pad}${fence}` : "";
    }
    case "IMG": {
      // data-md-src holds the author's original path; src may be a blob URL
      // that must never reach the file.
      const href = el.dataset.mdSrc ?? el.getAttribute("src") ?? "";
      const alt = el.getAttribute("alt") ?? "";
      const title = el.getAttribute("title");
      return `![${alt}](${href}${title ? ` "${title}"` : ""})`;
    }
    case "A": {
      const href = el.getAttribute("href") ?? "";
      const title = el.getAttribute("title");
      const text = kids().trim();
      if (!href) return text;
      return `[${text || href}](${href}${title ? ` "${title}"` : ""})`;
    }
    case "SPAN":
      // A failed image is still an image in the source.
      if (el.classList.contains("aether-md-broken")) return brokenImage(el);
      return kids();
    default:
      return kids();
  }
}

/** A broken-image placeholder must serialize back to the original markdown. */
function brokenImage(el: HTMLElement): string {
  const href = el.dataset.mdSrc ?? "";
  const text = el.textContent ?? "";
  const alt = /Image not found: (.*) — /.exec(text)?.[1] ?? "";
  return `![${alt}](${href})`;
}

function listItems(list: HTMLElement, depth: number, out: string[]): void {
  const ordered = list.tagName === "OL";
  const startAttr = Number(list.getAttribute("start"));
  let index = Number.isFinite(startAttr) && startAttr > 0 ? startAttr : 1;

  for (const li of Array.from(list.children)) {
    if (li.tagName !== "LI") continue;
    const marker = ordered ? `${index++}.` : "-";
    const indent = "  ".repeat(depth);

    const nested: HTMLElement[] = [];
    const own: Node[] = [];
    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && ["UL", "OL"].includes((child as Element).tagName)) {
        nested.push(child as HTMLElement);
      } else {
        own.push(child);
      }
    }

    const box = li.querySelector<HTMLInputElement>(':scope > input[type="checkbox"]');
    const task = box ? (box.checked ? "[x] " : "[ ] ") : "";
    const text = own
      .filter((n) => n !== box)
      .map((n) => (isBlock(n) ? blocks(n as HTMLElement).join("\n\n") : inline(n)))
      .join("")
      .trim()
      .replace(/\n/g, `\n${indent}  `);

    out.push(`${indent}${marker} ${task}${text}`);
    for (const sub of nested) listItems(sub, depth + 1, out);
  }
}

function tableRows(table: HTMLElement): string[] {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return [];

  const cells = (tr: Element) =>
    Array.from(tr.children).map((c) =>
      Array.from(c.childNodes).map(inline).join("").trim().replace(/\|/g, "\\|"),
    );

  const head = cells(rows[0]);
  const out = [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`];
  for (const tr of rows.slice(1)) out.push(`| ${cells(tr).join(" | ")} |`);
  return out;
}

/** One markdown block per element, recursing through wrappers. */
function blocks(root: HTMLElement): string[] {
  const out: string[] = [];

  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").trim();
      if (text) out.push(escapeText(text));
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const el = node as HTMLElement;
    switch (el.tagName) {
      case "H1":
      case "H2":
      case "H3":
      case "H4":
      case "H5":
      case "H6": {
        const text = Array.from(el.childNodes).map(inline).join("").trim();
        if (text) out.push(`${"#".repeat(Number(el.tagName[1]))} ${text}`);
        break;
      }
      case "P": {
        const text = Array.from(el.childNodes).map(inline).join("").trim();
        if (text) out.push(text);
        break;
      }
      case "UL":
      case "OL": {
        const items: string[] = [];
        listItems(el, 0, items);
        if (items.length) out.push(items.join("\n"));
        break;
      }
      case "PRE": {
        const code = el.querySelector("code");
        const lang = /language-([\w+#-]+)/.exec(code?.className ?? "")?.[1] ?? "";
        const body = (code?.textContent ?? el.textContent ?? "").replace(/\n$/, "");
        out.push(`\`\`\`${lang}\n${body}\n\`\`\``);
        break;
      }
      case "BLOCKQUOTE": {
        const inner = blocks(el).join("\n\n");
        if (inner) {
          out.push(
            inner
              .split("\n")
              .map((line) => (line ? `> ${line}` : ">"))
              .join("\n"),
          );
        }
        break;
      }
      case "TABLE": {
        const rows = tableRows(el);
        if (rows.length) out.push(rows.join("\n"));
        break;
      }
      case "HR":
        out.push("---");
        break;
      case "BR":
        break;
      case "SPAN":
        if (el.classList.contains("aether-md-broken")) {
          out.push(brokenImage(el));
          break;
        }
        out.push(...blocks(el));
        break;
      case "DIV":
      case "SECTION":
      case "ARTICLE":
        out.push(...blocks(el));
        break;
      default: {
        // A stray inline element at block level still carries content.
        const text = inline(el).trim();
        if (text) out.push(text);
      }
    }
  }

  return out;
}

/** Serialize the rich-text DOM back to markdown source. */
export function htmlToMarkdown(root: HTMLElement): string {
  const body = blocks(root).join("\n\n").replace(/[ \t]+$/gm, "");
  return body ? `${body}\n` : "";
}
