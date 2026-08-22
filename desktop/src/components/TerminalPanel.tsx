import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, Reorder } from "motion/react";
import Terminal from "./Terminal";
import { AddIcon } from "../lib/icons/ui";
import { Chevron, CloseGlyph, ShellIcon } from "../icons";
import type { ShellKind, TerminalPanelProps, TerminalTab } from "../types";

const SHELL_LABEL: Record<ShellKind, string> = {
  powershell: "PowerShell",
  cmd: "Command Prompt",
};

export default function TerminalPanel({ rootPath, visible, onOpenUrl }: TerminalPanelProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const lastShellRef = useRef<ShellKind>("powershell");
  const pickerRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const addTab = useCallback((shell: ShellKind) => {
    lastShellRef.current = shell;
    const id = crypto.randomUUID();
    setTabs((prev) => {
      const sameKind = prev.filter((t) => t.shell === shell).length;
      const label = sameKind === 0 ? SHELL_LABEL[shell] : `${SHELL_LABEL[shell]} ${sameKind + 1}`;
      return [...prev, { id, shell, label }];
    });
    setActiveId(id);
    setPickerOpen(false);
  }, []);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (visible && !initializedRef.current) {
      initializedRef.current = true;
      addTab("powershell");
    }
  }, [visible, addTab]);

  const closeTab = useCallback((id: string) => {
    setTabs((prev: TerminalTab[]) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      setActiveId((cur) => (cur !== id ? cur : (next[idx] ?? next[idx - 1] ?? next[next.length - 1] ?? null)?.id ?? null));
      return next;
    });
  }, []);

  const startRename = useCallback((tab: TerminalTab) => {
    setRenamingId(tab.id);
    setRenameValue(tab.label);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      setTabs((prev) => prev.map((t) => (t.id === renamingId ? { ...t, label: trimmed } : t)));
    }
    setRenamingId(null);
  }, [renamingId, renameValue]);

  // Close picker on outside click.
  useEffect(() => {
    if (!pickerOpen) return;
    const onClickAway = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    window.addEventListener("mousedown", onClickAway);
    return () => window.removeEventListener("mousedown", onClickAway);
  }, [pickerOpen]);

  return (
    <div className={visible ? "flex h-full flex-col" : "hidden"}>
      {/* ── Tab strip ─────────────────────────────────────────────────── */}
      <div className="flex h-9 shrink-0 items-stretch border-b border-white/[0.05] bg-abyss">
        <Reorder.Group
          as="div"
          axis="x"
          values={tabs}
          onReorder={setTabs}
          className="scroll-thin flex flex-1 items-stretch overflow-x-auto"
        >
          <AnimatePresence initial={false}>
            {tabs.map((tab) => {
              const active = tab.id === activeId;
              const renaming = tab.id === renamingId;
              return (
                <Reorder.Item
                  as="div"
                  key={tab.id}
                  value={tab}
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ type: "spring", stiffness: 600, damping: 44 }}
                  role="tab"
                  tabIndex={0}
                  aria-selected={active}
                  onClick={() => setActiveId(tab.id)}
                  onDoubleClick={() => startRename(tab)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveId(tab.id);
                    }
                  }}
                  title={`${tab.label} — double-click to rename`}
                  className={`group relative flex shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-white/[0.04] px-3 text-[12px] transition-colors ${
                    active
                      ? "bg-canvas/60 text-white"
                      : "text-zinc-500 hover:bg-white/[0.02] hover:text-zinc-300"
                  }`}
                >
                  {/* Active indicator */}
                  {active && (
                    <motion.span
                      layoutId="terminal-tab-active"
                      className="absolute inset-x-0 top-0 h-[2px] bg-white/80"
                      transition={{ type: "spring", stiffness: 550, damping: 42 }}
                    />
                  )}

                  {/* Shell icon */}
                  <span className={active ? "opacity-90" : "opacity-50 group-hover:opacity-70"}>
                    <ShellIcon shell={tab.shell} size={13} />
                  </span>

                  {/* Label / rename input */}
                  {renaming ? (
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      autoFocus
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenamingId(null);
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-28 bg-transparent text-[12px] text-white outline-none"
                    />
                  ) : (
                    <span className="whitespace-nowrap">{tab.label}</span>
                  )}

                  {/* Close button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    aria-label={`Close ${tab.label}`}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-zinc-500 opacity-0 transition-all hover:bg-white/[0.12] hover:text-zinc-200 group-hover:opacity-100"
                  >
                    <CloseGlyph size={10} />
                  </button>
                </Reorder.Item>
              );
            })}
          </AnimatePresence>
        </Reorder.Group>

        {/* ── Right-side controls ────────────────────────────────────── */}
        <div ref={pickerRef} className="relative flex shrink-0 items-center gap-0.5 px-1.5">
          <button
            type="button"
            onClick={() => addTab(lastShellRef.current)}
            aria-label="New Terminal"
            title="New Terminal"
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-zinc-200"
          >
            <AddIcon size={14} />
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            aria-label="Select Shell"
            aria-expanded={pickerOpen}
            className="flex h-6 w-5 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-zinc-200"
          >
            <Chevron open size={9} />
          </button>

          {/* Shell picker dropdown */}
          {pickerOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-lg border border-white/[0.08] bg-[#111111] py-1 shadow-2xl shadow-black/80"
            >
              {(Object.keys(SHELL_LABEL) as ShellKind[]).map((shell) => (
                <button
                  key={shell}
                  type="button"
                  onClick={() => addTab(shell)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <ShellIcon shell={shell} size={14} />
                  <span>{SHELL_LABEL[shell]}</span>
                </button>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Terminal panes ─────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1">
        {tabs.map((tab) => (
          <div key={tab.id} className={tab.id === activeId ? "h-full w-full" : "hidden"}>
            <Terminal
              rootPath={rootPath}
              shell={tab.shell}
              visible={visible && tab.id === activeId}
              onOpenUrl={onOpenUrl}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
