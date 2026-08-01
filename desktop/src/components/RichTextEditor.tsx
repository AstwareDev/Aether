import { useCallback, useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { hydrateImages } from "../lib/markdown/images";
import { renderDocument } from "../lib/markdown/render";
import { htmlToMarkdown } from "../lib/markdown/serialize";
import "../styles/markdown.css";

interface RichTextEditorProps {
  path: string;
  content: string;
  onChange: (markdown: string) => void;
  onSave: () => void;
}

type Cmd =
  | { kind: "inline"; command: string }
  | { kind: "block"; tag: string }
  | { kind: "list"; command: string }
  | { kind: "link" };

const TOOLS: { label: string; title: string; cmd: Cmd; className?: string }[] = [
  { label: "B", title: "Bold (Ctrl+B)", cmd: { kind: "inline", command: "bold" }, className: "font-semibold" },
  { label: "I", title: "Italic (Ctrl+I)", cmd: { kind: "inline", command: "italic" }, className: "italic" },
  { label: "S", title: "Strikethrough", cmd: { kind: "inline", command: "strikeThrough" }, className: "line-through" },
  { label: "H1", title: "Heading 1", cmd: { kind: "block", tag: "h1" } },
  { label: "H2", title: "Heading 2", cmd: { kind: "block", tag: "h2" } },
  { label: "H3", title: "Heading 3", cmd: { kind: "block", tag: "h3" } },
  { label: "Text", title: "Paragraph", cmd: { kind: "block", tag: "p" } },
  { label: "List", title: "Bulleted list", cmd: { kind: "list", command: "insertUnorderedList" } },
  { label: "1. List", title: "Numbered list", cmd: { kind: "list", command: "insertOrderedList" } },
  { label: "Quote", title: "Blockquote", cmd: { kind: "block", tag: "blockquote" } },
  { label: "Code", title: "Code block", cmd: { kind: "block", tag: "pre" } },
  { label: "Link", title: "Insert link (Ctrl+K)", cmd: { kind: "link" } },
];

export default function RichTextEditor({ path, content, onChange, onSave }: RichTextEditorProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [linking, setLinking] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const savedRange = useRef<Range | null>(null);

  // The markdown source is only re-rendered into the DOM when it changes from
  // outside this editor. Re-rendering on our own edits would fight the caret.
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    const host = bodyRef.current;
    if (!host) return;
    if (content === lastEmitted.current) return;
    host.innerHTML = DOMPurify.sanitize(renderDocument(content));
    void hydrateImages(host, path);
  }, [content, path]);

  const emit = useCallback(() => {
    const host = bodyRef.current;
    if (!host) return;
    const markdown = htmlToMarkdown(host);
    lastEmitted.current = markdown;
    onChange(markdown);
  }, [onChange]);

  const run = useCallback(
    (cmd: Cmd) => {
      const host = bodyRef.current;
      if (!host) return;
      host.focus();

      if (cmd.kind === "link") {
        const sel = window.getSelection();
        savedRange.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
        setLinkUrl("");
        setLinking(true);
        return;
      }

      if (cmd.kind === "inline") document.execCommand(cmd.command);
      else if (cmd.kind === "list") document.execCommand(cmd.command);
      else document.execCommand("formatBlock", false, cmd.tag);

      emit();
    },
    [emit],
  );

  const applyLink = useCallback(() => {
    const host = bodyRef.current;
    const url = linkUrl.trim();
    setLinking(false);
    if (!host || !url) return;

    host.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    if (sel?.isCollapsed) document.execCommand("insertText", false, url);
    // Reselect the inserted text so createLink has a target.
    if (sel?.isCollapsed) {
      const range = sel.getRangeAt(0);
      range.setStart(range.startContainer, Math.max(0, range.startOffset - url.length));
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand("createLink", false, url);
    emit();
  }, [linkUrl, emit]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        onSave();
        return;
      }
      if (key === "k") {
        e.preventDefault();
        run({ kind: "link" });
        return;
      }
      if (key === "b" || key === "i") {
        // The browser applies these natively; sync afterwards.
        requestAnimationFrame(emit);
      }
    },
    [onSave, run, emit],
  );

  // Pasting rich HTML from Word or Notion would inject styling the serializer
  // cannot represent, so paste lands as plain text.
  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, text);
      emit();
    },
    [emit],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-white/[0.05] px-3 py-1.5">
        {TOOLS.map((tool) => (
          <button
            key={tool.label}
            type="button"
            title={tool.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(tool.cmd)}
            className={`focus-ring rounded px-2 py-1 text-[12px] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 ${tool.className ?? ""}`}
          >
            {tool.label}
          </button>
        ))}
      </div>

      {linking && (
        <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.05] bg-white/[0.02] px-3 py-2">
          <label htmlFor="rt-link" className="text-[12px] text-zinc-400">
            Link URL
          </label>
          <input
            id="rt-link"
            autoFocus
            value={linkUrl}
            spellCheck={false}
            placeholder="https://…"
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") setLinking(false);
            }}
            className="focus-ring min-w-0 flex-1 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-1 font-mono text-[12px] text-zinc-100"
          />
          <button
            type="button"
            onClick={applyLink}
            className="focus-ring rounded border border-white/10 px-2 py-1 text-[12px] text-zinc-300 hover:bg-white/[0.06]"
          >
            Add
          </button>
        </div>
      )}

      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        <div
          ref={bodyRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Rich text editor"
          data-placeholder="Start writing…"
          spellCheck
          onInput={emit}
          onBlur={emit}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className="aether-md mx-auto max-w-3xl px-8 py-10"
        />
      </div>
    </div>
  );
}
