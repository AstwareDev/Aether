import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import fuzzysort from "fuzzysort";
import { useFocusTrap } from "../lib/useFocusTrap";
import { baseName } from "../lib/fs";
import type { CommandPaletteProps, PaletteItem } from "../types";
import { FileTypeIcon } from "../lib/icons";
import { GoToFileIcon } from "../lib/icons/ui";

const LIMIT = 60;

/** Group chars into runs by (matched, bright) so we render few spans. */
function Highlighted({ text, indexes, brightFrom }: { text: string; indexes: readonly number[]; brightFrom: number }) {
  const set = useMemo(() => new Set(indexes), [indexes]);
  const runs: { str: string; match: boolean; bright: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const match = set.has(i);
    const bright = i >= brightFrom;
    const last = runs[runs.length - 1];
    if (last && last.match === match && last.bright === bright) last.str += text[i];
    else runs.push({ str: text[i], match, bright });
  }
  return (
    <>
      {runs.map((r, i) => (
        <span
          key={i}
          className={r.match ? "text-accent font-semibold" : r.bright ? "text-zinc-200" : "text-zinc-500"}
        >
          {r.str}
        </span>
      ))}
    </>
  );
}

export default function CommandPalette({ open, mode, files, commands, onClose, onOpenFile }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  // Reset state each time the palette opens; commands mode prefills ">".
  // Focusing here (not via autoFocus) runs *after* useFocusTrap has recorded the
  // previously-focused element, so closing restores focus to the editor/tree.
  useEffect(() => {
    if (!open) return;
    setQuery(mode === "commands" ? ">" : "");
    setSelected(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, mode]);

  const isCommandMode = query.startsWith(">");
  const term = (isCommandMode ? query.slice(1) : query).trim();

  const items: PaletteItem[] = useMemo(() => {
    if (!open) return [];
    if (isCommandMode) {
      const enabled = commands.filter((c) => c.enabled !== false);
      if (!term) {
        return enabled.map((command) => ({ kind: "command", command, text: command.title, indexes: [] }));
      }
      const targets = enabled.map((c) => ({ c, hay: [c.title, c.category, c.keywords].filter(Boolean).join(" ") }));
      return fuzzysort.go(term, targets, { key: "hay", limit: LIMIT }).map((r) => {
        const title = r.obj.c.title;
        const titleMatch = fuzzysort.single(term, title);
        return { kind: "command", command: r.obj.c, text: title, indexes: titleMatch?.indexes ?? [] };
      });
    }
    if (!term) {
      return files.slice(0, LIMIT).map((file) => ({ kind: "file", file, text: file.rel, indexes: [] }));
    }
    return fuzzysort
      .go(term, files, { key: "rel", limit: LIMIT })
      .map((r) => ({ kind: "file", file: r.obj, text: r.target, indexes: r.indexes }));
  }, [open, isCommandMode, term, files, commands]);

  // Keep selection in range and scrolled into view.
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [selected, items]);

  const run = (item: PaletteItem) => {
    onClose();
    if (item.kind === "file") onOpenFile(item.file.path);
    else item.command.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => (items.length ? (s + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => (items.length ? (s - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[selected];
      if (item) run(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onMouseDown={onClose}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="relative w-full max-w-xl"
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 480, damping: 34 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* aurora glow */}
            <div className="pointer-events-none absolute -inset-x-16 -top-24 h-48 overflow-hidden">
              <div
                className="aether-aurora mx-auto h-48 w-96 rounded-full opacity-40 blur-3xl"
                style={{ background: "radial-gradient(closest-side, var(--color-accent), var(--color-accent-soft), transparent)" }}
              />
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-abyss/95 shadow-2xl shadow-black/70 ring-1 ring-black/20">
              <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-4">
                <span className="text-zinc-500">
                  <GoToFileIcon size={16} />
                </span>
                <input
                  ref={inputRef}
                  value={query}
                  spellCheck={false}
                  role="combobox"
                  aria-expanded={items.length > 0}
                  aria-controls="palette-listbox"
                  aria-autocomplete="list"
                  aria-activedescendant={items[selected] ? `palette-opt-${selected}` : undefined}
                  aria-label={isCommandMode ? "Type a command" : "Search files by name"}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={isCommandMode ? "Type a command…" : "Search files by name (type > for commands)"}
                  className="flex-1 bg-transparent py-3.5 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                />
                <kbd className="hidden rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-500 sm:block">
                  {isCommandMode ? "Commands" : "Files"}
                </kbd>
              </div>

              <div
                ref={listRef}
                id="palette-listbox"
                role="listbox"
                aria-label={isCommandMode ? "Commands" : "Files"}
                className="scroll-thin max-h-[52vh] overflow-y-auto py-1.5"
              >
                {items.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-zinc-500">
                    {isCommandMode ? "No matching commands" : term ? "No matching files" : "Start typing to search files"}
                  </p>
                ) : (
                  items.map((item, i) => (
                    <Row
                      key={item.kind === "file" ? item.file.path : item.command.id}
                      id={`palette-opt-${i}`}
                      item={item}
                      selected={i === selected}
                      onHover={() => setSelected(i)}
                      onClick={() => run(item)}
                    />
                  ))
                )}
              </div>

              <div className="flex items-center gap-4 border-t border-white/[0.07] px-4 py-2 text-[10px] text-zinc-500">
                <span><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
                <span><Kbd>↵</Kbd> open</span>
                <span><Kbd>esc</Kbd> dismiss</span>
                {!isCommandMode && <span className="ml-auto"><Kbd>&gt;</Kbd> commands</span>}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="mr-0.5 rounded bg-white/[0.06] px-1 py-0.5 font-sans text-[10px] text-zinc-400">{children}</kbd>;
}

function Row({
  id,
  item,
  selected,
  onHover,
  onClick,
}: {
  id: string;
  item: PaletteItem;
  selected: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const base = `flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
    selected ? "bg-accent/[0.14]" : "hover:bg-white/[0.04]"
  }`;

  if (item.kind === "file") {
    const dir = item.text.slice(0, item.text.length - baseName(item.text).length);
    return (
      <button
        type="button"
        id={id}
        role="option"
        aria-selected={selected}
        data-selected={selected}
        onMouseMove={onHover}
        onClick={onClick}
        className={base}
      >
        <FileTypeIcon name={baseName(item.file.rel)} className="shrink-0" />
        <span className="flex min-w-0 flex-1 items-baseline gap-2 truncate font-mono text-[13px]">
          <Highlighted text={item.text} indexes={item.indexes} brightFrom={dir.length} />
        </span>
      </button>
    );
  }

  const Icon = item.command.icon;
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={selected}
      data-selected={selected}
      onMouseMove={onHover}
      onClick={onClick}
      className={base}
    >
      <span className="flex w-4 shrink-0 justify-center text-zinc-500">{Icon ? <Icon size={16} /> : null}</span>
      <span className="min-w-0 flex-1 truncate">
        {item.command.category && <span className="text-zinc-500">{item.command.category}: </span>}
        <Highlighted text={item.text} indexes={item.indexes} brightFrom={0} />
      </span>
      {item.command.shortcut && (
        <span className="shrink-0 font-mono text-[11px] text-zinc-500">{item.command.shortcut}</span>
      )}
    </button>
  );
}
