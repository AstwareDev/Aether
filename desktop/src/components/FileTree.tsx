import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { readDir, type DirEntry, revealInExplorer, openInTerminal, dirName, baseName, joinPath, readFileText, writeFileText, copyEntry, deleteEntry as deleteEntryFs, createEntry, renameEntry as renameEntryFs } from "../lib/fs";
import { FileTypeIcon, FolderTypeIcon } from "../lib/icons";
import { Chevron, CheckGlyph, CloseGlyph } from "../icons";
import type { InternalCtx, FileTreeProps, MenuState, MIProps } from "../types";

const TreeCtx = createContext<InternalCtx | null>(null);
function useTree() {
  const ctx = useContext(TreeCtx);
  if (!ctx) throw new Error("TreeCtx missing");
  return ctx;
}

const INDENT = 12;
const BASE = 10;

type ClipboardState = {
  paths: string[];
  operation: "copy" | "cut";
} | null;

type HistoryOperation =
  | { type: "create"; path: string; isDir: boolean; content?: string }
  | { type: "delete"; path: string; isDir: boolean; content?: string }
  | { type: "rename"; oldPath: string; newPath: string }
  | { type: "move"; sourcePath: string; oldParent: string; newParent: string };

/** True if `path` is `ancestor` itself or lives inside it. */
function isPathWithinOrEqual(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(ancestor + "/") || path.startsWith(ancestor + "\\");
}

export default function FileTree({ rootPath, actions, expanded, onToggle, refreshNonce, onChangeWorkspace, onGoHome }: FileTreeProps) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastClickedPath, setLastClickedPath] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState>(null);
  const [undoStack, setUndoStack] = useState<HistoryOperation[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryOperation[]>([]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    readDir(rootPath)
      .then((e) => !cancelled && setEntries(e))
      .catch((err) => !cancelled && setError(String(err)));
    return () => {
      cancelled = true;
    };
  }, [rootPath, refreshNonce]);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (undoStack.length === 0) return;

        const op = undoStack[undoStack.length - 1];
        setUndoStack(undoStack.slice(0, -1));
        setRedoStack([...redoStack, op]);

        try {
          if (op.type === "create") {
            await deleteEntryFs(op.path);
          } else if (op.type === "delete") {
            if (op.content !== undefined) {
              await createEntry(op.path, op.isDir);
              if (!op.isDir && op.content) {
                await writeFileText(op.path, op.content);
              }
            }
          } else if (op.type === "rename") {
            await renameEntryFs(op.newPath, op.oldPath);
          } else if (op.type === "move") {
            const name = baseName(op.sourcePath);
            const currentPath = joinPath(op.newParent, name);
            const originalPath = joinPath(op.oldParent, name);
            await renameEntryFs(currentPath, originalPath);
          }
        } catch (err) {
          console.error("Undo failed:", err);
        }
        return;
      }

      if (ctrl && e.key === "y") {
        e.preventDefault();
        if (redoStack.length === 0) return;

        const op = redoStack[redoStack.length - 1];
        setRedoStack(redoStack.slice(0, -1));
        setUndoStack([...undoStack, op]);

        try {
          if (op.type === "create") {
            await createEntry(op.path, op.isDir);
          } else if (op.type === "delete") {
            await deleteEntryFs(op.path);
          } else if (op.type === "rename") {
            await renameEntryFs(op.oldPath, op.newPath);
          } else if (op.type === "move") {
            const name = baseName(op.sourcePath);
            const originalPath = joinPath(op.oldParent, name);
            const newPath = joinPath(op.newParent, name);
            await renameEntryFs(originalPath, newPath);
          }
        } catch (err) {
          console.error("Redo failed:", err);
        }
        return;
      }

      if (selectedPaths.size === 0 && !ctrl) return;

      if (e.key === "Delete") {
        e.preventDefault();
        const firstPath = Array.from(selectedPaths)[0];
        actions.onBeginDelete(firstPath, false);
      } else if (e.key === "F2") {
        e.preventDefault();
        const firstPath = Array.from(selectedPaths)[0];
        actions.onBeginRename(firstPath);
      } else if (ctrl && e.key === "c") {
        e.preventDefault();
        setClipboard({ paths: Array.from(selectedPaths), operation: "copy" });
      } else if (ctrl && e.key === "x") {
        e.preventDefault();
        setClipboard({ paths: Array.from(selectedPaths), operation: "cut" });
      } else if (ctrl && e.key === "v") {
        e.preventDefault();

        try {
          const clipboardItems = await navigator.clipboard.read();
          let hasFiles = false;

          for (const item of clipboardItems) {
            if (item.types.includes("text/uri-list")) {
              const blob = await item.getType("text/uri-list");
              const text = await blob.text();
              const uris = text.split("\n").filter(u => u.trim());

              const targetDir = selectedPaths.size === 1 ? Array.from(selectedPaths)[0] : rootPath;

              for (const uri of uris) {
                let filePath = uri.trim();
                if (filePath.startsWith("file:///")) {
                  filePath = decodeURIComponent(filePath.substring(8));
                } else if (filePath.startsWith("file://")) {
                  filePath = decodeURIComponent(filePath.substring(7));
                }

                if (filePath) {
                  const name = baseName(filePath);
                  const destPath = joinPath(targetDir, name);
                  try {
                    await copyEntry(filePath, destPath);
                    hasFiles = true;
                  } catch (err) {
                    console.error("Failed to copy file:", err);
                  }
                }
              }

              if (hasFiles) return;
            }
          }
        } catch (err) {
          console.log("No files in clipboard, trying internal clipboard");
        }

        if (clipboard) {
          const targetDir = selectedPaths.size === 1 ? Array.from(selectedPaths)[0] : rootPath;
          clipboard.paths.forEach(async (srcPath) => {
            if (clipboard.operation === "cut") {
              actions.onMoveEntry(srcPath, targetDir);
            } else {
              const name = baseName(srcPath);
              const destPath = joinPath(targetDir, name);
              try {
                await copyEntry(srcPath, destPath);
              } catch (err) {
                console.error("Failed to copy:", err);
              }
            }
          });
          if (clipboard.operation === "cut") setClipboard(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPaths, clipboard, rootPath, actions, undoStack, redoStack]);

  const ctxValue: InternalCtx = useMemo(
    () => ({
      ...actions,
      openMenu: (x, y, entry) => setMenu({ x, y, entry }),
      rootPath,
      expanded,
      onToggle,
      refreshNonce,
      onChangeWorkspace,
      onGoHome,
      draggingPath,
      setDraggingPath,
      dragOverPath,
      setDragOverPath,
      selectedPaths,
      setSelectedPaths,
      lastClickedPath,
      setLastClickedPath,
      clipboard,
      setClipboard,
    }),
    [actions, rootPath, expanded, onToggle, refreshNonce, onChangeWorkspace, onGoHome, draggingPath, dragOverPath, selectedPaths, lastClickedPath, clipboard],
  );

  return (
    <TreeCtx.Provider value={ctxValue}>
      <div
        className="min-h-full py-1 text-zinc-300 select-none"
        role="tree"
        aria-label="Files"
        onMouseDown={(e) => {
          // Click directly on the container (empty space) clears selection
          if ((e.target as HTMLElement) === e.currentTarget) {
            setSelectedPaths(new Set());
            setLastClickedPath(null);
          }
        }}
        onContextMenu={(e) => {
          // Only show empty-space menu when the click lands on the container itself
          if ((e.target as HTMLElement) === e.currentTarget) {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, entry: null });
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverPath(rootPath);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const src = e.dataTransfer.getData("text/plain");
          if (src) actions.onMoveEntry(src, rootPath);
          setDraggingPath(null);
          setDragOverPath(null);
        }}
      >
        {error && <p className="px-3 py-2 text-xs text-red-400/80">{error}</p>}
        {!error && !entries && <SkeletonRows />}
        {entries && entries.length === 0 && !actions.creating && (
          <p className="px-3 py-2 text-xs text-zinc-500">This folder is empty.</p>
        )}
        {actions.creating?.parentPath === rootPath && (
          <InlineEditRow depth={0} mode="create" isDir={actions.creating.isDir} />
        )}
        {entries?.map((entry) => (
          <TreeNode key={entry.path} entry={entry} depth={0} />
        ))}
      </div>

      <AnimatePresence>
        {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      </AnimatePresence>
    </TreeCtx.Provider>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-1.5 px-3 py-1.5" aria-hidden="true">
      {[0.9, 0.6, 0.75, 0.5, 0.8].map((w, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded bg-white/[0.05]"
          style={{ width: `${w * 100}%`, animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

const TreeNode = memo(function TreeNode({ entry, depth }: { entry: DirEntry; depth: number }) {
  const tree = useTree();
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const open = entry.is_dir && tree.expanded.has(entry.path);
  const isActive = !entry.is_dir && tree.activePath === entry.path;
  const isSelected = tree.selectedPaths.has(entry.path);
  const paddingLeft = BASE + depth * INDENT;
  const isRenaming = tree.renamingPath === entry.path;
  const isDeleting = tree.deletingPath === entry.path;
  const invalidDropTarget = tree.draggingPath ? isPathWithinOrEqual(entry.path, tree.draggingPath) : false;
  const isDragOver = entry.is_dir && !invalidDropTarget && tree.dragOverPath === entry.path;
  const isDragging = tree.draggingPath === entry.path;

  // Load (and refresh) children whenever this folder is open.
  useEffect(() => {
    if (!entry.is_dir || !open) return;
    let cancelled = false;
    setLoading(true);
    readDir(entry.path)
      .then((c) => {
        if (!cancelled) {
          setChildren(c);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChildren([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entry.is_dir, entry.path, open, tree.refreshNonce]);

  const handleClick = (e: React.MouseEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    if (entry.is_dir) {
      tree.onToggle(entry.path);
    } else {
      tree.onOpenFile(entry.path);
    }

    if (ctrl) {
      const next = new Set(tree.selectedPaths);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      tree.setSelectedPaths(next);
      tree.setLastClickedPath(entry.path);
    } else if (shift && tree.lastClickedPath) {
      const next = new Set(tree.selectedPaths);
      next.add(entry.path);
      tree.setSelectedPaths(next);
    } else {
      tree.setSelectedPaths(new Set([entry.path]));
      tree.setLastClickedPath(entry.path);
    }
  };

  if (isDeleting) {
    return <DeleteConfirmRow entry={entry} depth={depth} />;
  }

  // Determine row background
  let rowBg: string;
  if (isSelected) {
    rowBg = "bg-white/[0.08] text-zinc-100";
  } else if (isActive) {
    rowBg = "bg-white/[0.07] text-white";
  } else {
    rowBg = "text-zinc-400 hover:bg-white/[0.035] hover:text-zinc-200";
  }

  return (
    <>
      {isRenaming ? (
        <InlineEditRow depth={depth} mode="rename" isDir={entry.is_dir} initialValue={entry.name} />
      ) : (
        <button
          type="button"
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={entry.is_dir ? open : undefined}
          aria-selected={isSelected}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", entry.path);
            e.dataTransfer.effectAllowed = "move";
            tree.setDraggingPath(entry.path);
          }}
          onDragEnd={() => {
            tree.setDraggingPath(null);
            tree.setDragOverPath(null);
          }}
          onDragOver={(e) => {
            if (!entry.is_dir || invalidDropTarget) return;
            e.preventDefault();
            e.stopPropagation();
            tree.setDragOverPath(entry.path);
          }}
          onDrop={(e) => {
            if (!entry.is_dir || invalidDropTarget) return;
            e.preventDefault();
            e.stopPropagation();

            const files = e.dataTransfer.files;
            if (files.length > 0) {
              Array.from(files).forEach(async (file) => {
                const destPath = joinPath(entry.path, file.name);
                const reader = new FileReader();
                reader.onload = async () => {
                  const content = reader.result as string;
                  try {
                    await writeFileText(destPath, content);
                  } catch (err) {
                    console.error("Failed to write dropped file:", err);
                  }
                };
                reader.readAsText(file);
              });
              tree.setDraggingPath(null);
              tree.setDragOverPath(null);
              return;
            }

            const src = e.dataTransfer.getData("text/plain");
            if (src) tree.onMoveEntry(src, entry.path);
            tree.setDraggingPath(null);
            tree.setDragOverPath(null);
          }}
          onClick={handleClick}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation(); // prevent empty-space menu from also firing
            // Auto-select the right-clicked entry if it isn't already selected
            if (!tree.selectedPaths.has(entry.path)) {
              tree.setSelectedPaths(new Set([entry.path]));
              tree.setLastClickedPath(entry.path);
            }
            tree.openMenu(e.clientX, e.clientY, entry);
          }}
          title={entry.name}
          style={{ paddingLeft }}
          className={[
            "group relative flex w-full items-center gap-1.5 py-[3px] pr-2 text-left text-[13px] outline-none transition-colors duration-100 focus-visible:bg-white/[0.06]",
            rowBg,
            isDragOver ? "bg-accent/10 ring-1 ring-inset ring-accent/50" : "",
            isDragging ? "opacity-40" : "",
          ].join(" ")}
        >
          {/* Active-file indicator stripe (only when not selected) */}
          {isActive && !isSelected && <span className="absolute inset-y-0 left-0 w-[2px] bg-accent" />}
          {entry.is_dir ? (
            <span className="flex w-3 justify-center text-zinc-500 group-hover:text-zinc-300">
              <Chevron open={open} />
            </span>
          ) : (
            <span className="inline-block w-3 shrink-0" />
          )}
          {entry.is_dir ? (
            <FolderTypeIcon name={entry.name} open={open} className="shrink-0" />
          ) : (
            <FileTypeIcon name={entry.name} className="shrink-0" />
          )}
          <span className="truncate">{entry.name}</span>
        </button>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="children"
            role="group"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 44, opacity: { duration: 0.12 } }}
            className="relative overflow-hidden"
            onDragOver={(e) => {
              if (invalidDropTarget) return;
              e.preventDefault();
              e.stopPropagation();
              tree.setDragOverPath(entry.path);
            }}
            onDrop={(e) => {
              if (invalidDropTarget) return;
              e.preventDefault();
              e.stopPropagation();
              const src = e.dataTransfer.getData("text/plain");
              if (src) tree.onMoveEntry(src, entry.path);
              tree.setDraggingPath(null);
              tree.setDragOverPath(null);
            }}
          >
            <span
              className="pointer-events-none absolute inset-y-0 w-px bg-white/[0.06]"
              style={{ left: paddingLeft + 5 }}
            />
            {loading && !children && (
              <p style={{ paddingLeft: paddingLeft + INDENT + 14 }} className="py-[3px] text-xs text-zinc-500">
                Loading…
              </p>
            )}
            {tree.creating?.parentPath === entry.path && (
              <InlineEditRow depth={depth + 1} mode="create" isDir={tree.creating.isDir} />
            )}
            {children?.map((child) => (
              <TreeNode key={child.path} entry={child} depth={depth + 1} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

/** VSCode-style inline `<input>` row used for both "new file/folder" and rename. */
function InlineEditRow({
  depth,
  mode,
  isDir,
  initialValue = "",
}: {
  depth: number;
  mode: "create" | "rename";
  isDir: boolean;
  initialValue?: string;
}) {
  const tree = useTree();
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSubmittedRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const paddingLeft = BASE + depth * INDENT;

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if (mode === "rename") {
        const dot = initialValue.lastIndexOf(".");
        el.setSelectionRange(0, dot > 0 ? dot : initialValue.length);
      }
    });
    return () => cancelAnimationFrame(id);
    // Only run on mount: re-selecting on every keystroke would fight the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = () => {
    if (cancelledRef.current) return;
    cancelledRef.current = true;
    if (mode === "create") tree.onCancelCreate();
    else tree.onCancelRename();
  };

  const commit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      cancel();
      return;
    }
    // Guards against the ghost `blur` a browser fires when the input is
    // unmounted right after a successful Enter-driven commit.
    if (lastSubmittedRef.current === trimmed) return;
    lastSubmittedRef.current = trimmed;
    if (mode === "create") tree.onCommitCreate(trimmed);
    else tree.onCommitRename(trimmed);
  };

  return (
    <div style={{ paddingLeft }} className="flex w-full items-center gap-1.5 py-[3px] pr-2 text-[13px]">
      <span className="inline-block w-3 shrink-0" />
      {isDir ? (
        <FolderTypeIcon name={value} open={false} className="shrink-0" />
      ) : (
        <FileTypeIcon name={value} className="shrink-0" />
      )}
      <input
        ref={inputRef}
        value={value}
        spellCheck={false}
        aria-label={mode === "create" ? (isDir ? "New folder name" : "New file name") : "Rename"}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        className="min-w-0 flex-1 rounded border border-accent/50 bg-void px-1 py-0 font-mono text-[13px] text-zinc-100 outline-none ring-1 ring-accent/30 focus:ring-accent/50"
      />
    </div>
  );
}

/** Inline, non-modal delete confirmation swapped in for the row being deleted. */
function DeleteConfirmRow({ entry, depth }: { entry: DirEntry; depth: number }) {
  const tree = useTree();
  const rowRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const paddingLeft = BASE + depth * INDENT;

  useEffect(() => {
    const focusId = requestAnimationFrame(() => confirmRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") tree.onCancelDelete();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) tree.onCancelDelete();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      cancelAnimationFrame(focusId);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [tree]);

  return (
    <div
      ref={rowRef}
      style={{ paddingLeft }}
      className="flex w-full items-center gap-1.5 bg-red-500/[0.07] py-[3px] pr-1.5 text-[13px]"
    >
      <span className="inline-block w-3 shrink-0" />
      {entry.is_dir ? (
        <FolderTypeIcon name={entry.name} open={false} className="shrink-0" />
      ) : (
        <FileTypeIcon name={entry.name} className="shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate text-red-300">Delete "{entry.name}"?</span>
      <button
        ref={confirmRef}
        type="button"
        title="Confirm delete"
        onClick={() => tree.onConfirmDelete()}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
      >
        <CheckGlyph size={12} />
      </button>
      <button
        type="button"
        title="Cancel"
        onClick={() => tree.onCancelDelete()}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-200"
      >
        <CloseGlyph size={11} />
      </button>
    </div>
  );
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const tree = useTree();
  const { entry } = menu;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function run(fn: () => void) {
    fn();
    onClose();
  }

  function relPath(absPath: string) {
    const root = tree.rootPath.replace(/[/\\]+$/, "");
    return absPath.startsWith(root)
      ? absPath.slice(root.length).replace(/^[/\\]/, "")
      : absPath.replace(/^.*[/\\]/, "");
  }

  const x = Math.min(menu.x, window.innerWidth - 270);
  const y = Math.min(menu.y, window.innerHeight - 420);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onMouseDown={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />

      <motion.div
        role="menu"
        initial={{ opacity: 0, scale: 0.97, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.08 }}
        style={{ left: x, top: y }}
        className="fixed z-50 w-[262px] overflow-hidden rounded-lg border border-white/[0.05] bg-[#0d0d0d] py-1 shadow-[0_8px_40px_rgba(0,0,0,0.85)] text-[13px]"
      >
        {entry === null ? (
          /* ── Empty space ──────────────────────────────────────────────── */
          <>
            <MI label="New File..." onClick={() => run(() => tree.onBeginCreate(tree.rootPath, false))} />
            <MI label="New Folder..." onClick={() => run(() => tree.onBeginCreate(tree.rootPath, true))} />
            <Sep />
            <MI label="Change workspace folder" onClick={() => run(tree.onChangeWorkspace)} />
            <MI label="Go to homepage" onClick={() => run(tree.onGoHome)} />
            <Sep />
            <MI label="Find in Folder..." shortcut="Shift+Alt+F" onClick={() => {}} disabled />
            <Sep />
            <MI
              label="Paste"
              shortcut="Ctrl+V"
              disabled={!tree.clipboard}
              onClick={() => run(() => {
                if (!tree.clipboard) return;
                tree.clipboard.paths.forEach((srcPath) => {
                  if (tree.clipboard!.operation === "cut") {
                    tree.onMoveEntry(srcPath, tree.rootPath);
                  } else {
                    const name = baseName(srcPath);
                    const destPath = joinPath(tree.rootPath, name);
                    readFileText(srcPath)
                      .then((content) => writeFileText(destPath, content))
                      .catch(() => {});
                  }
                });
                if (tree.clipboard.operation === "cut") tree.setClipboard(null);
              })}
            />
          </>
        ) : entry.is_dir ? (
          /* ── Folder ───────────────────────────────────────────────────── */
          <>
            <MI label="New File..." onClick={() => run(() => tree.onBeginCreate(entry.path, false))} />
            <MI label="New Folder..." onClick={() => run(() => tree.onBeginCreate(entry.path, true))} />
            <Sep />
            <MI label="Reveal in File Explorer" shortcut="Shift+Alt+R" onClick={() => run(() => revealInExplorer(entry.path))} />
            <MI label="Open in Integrated Terminal" onClick={() => run(() => openInTerminal(entry.path))} />
            <Sep />
            <MI label="Change workspace folder" onClick={() => run(tree.onChangeWorkspace)} />
            <MI label="Go to homepage" onClick={() => run(tree.onGoHome)} />
            <MI label="Remove Folder from Workspace" onClick={() => run(() => tree.onBeginDelete(entry.path, true))} danger />
            <Sep />
            <MI label="Add Directory to Aether Chat" onClick={() => {}} disabled />
            <MI label="Add Directory to New Aether Chat" onClick={() => {}} disabled />
            <Sep />
            <MI label="Find in Folder..." shortcut="Shift+Alt+F" onClick={() => {}} disabled />
            <Sep />
            <MI
              label="Paste"
              shortcut="Ctrl+V"
              disabled={!tree.clipboard}
              onClick={() => run(() => {
                if (!tree.clipboard) return;
                tree.clipboard.paths.forEach((srcPath) => {
                  if (tree.clipboard!.operation === "cut") {
                    tree.onMoveEntry(srcPath, entry.path);
                  } else {
                    const name = baseName(srcPath);
                    const destPath = joinPath(entry.path, name);
                    readFileText(srcPath)
                      .then((content) => writeFileText(destPath, content))
                      .catch(() => {});
                  }
                });
                if (tree.clipboard.operation === "cut") tree.setClipboard(null);
              })}
            />
            <MI label="Copy Path" shortcut="Ctrl+Shift+C" onClick={() => run(() => navigator.clipboard.writeText(entry.path))} />
            <MI label="Copy Relative Path" shortcut="Ctrl+M Ctrl+Shift+C" onClick={() => run(() => navigator.clipboard.writeText(relPath(entry.path)))} />
            <Sep />
            <MI label="Rename..." shortcut="F2" onClick={() => run(() => tree.onBeginRename(entry.path))} />
            <MI label="Delete" shortcut="Delete" onClick={() => run(() => tree.onBeginDelete(entry.path, true))} danger />
          </>
        ) : (
          /* ── File ─────────────────────────────────────────────────────── */
          <>
            <MI label="Open to the Side" shortcut="Ctrl+↵" onClick={() => run(() => tree.onOpenFile(entry.path))} />
            <MI label="Open in Browser" onClick={() => {}} disabled />
            <MI label="Open With..." onClick={() => {}} disabled />
            <MI label="Reveal in File Explorer" shortcut="Shift+Alt+R" onClick={() => run(() => revealInExplorer(entry.path))} />
            <MI label="Open in Integrated Terminal" onClick={() => run(() => openInTerminal(dirName(entry.path)))} />
            <Sep />
            <MI label="Add File to Aether Chat" onClick={() => {}} disabled />
            <MI label="Add File to New Aether Chat" onClick={() => {}} disabled />
            <Sep />
            <MI
              label="Cut"
              shortcut="Ctrl+X"
              onClick={() => run(() => tree.setClipboard({ paths: [entry.path], operation: "cut" }))}
            />
            <MI
              label="Copy"
              shortcut="Ctrl+C"
              onClick={() => run(() => tree.setClipboard({ paths: [entry.path], operation: "copy" }))}
            />
            <Sep />
            <MI label="Copy Path" shortcut="Shift+Alt+C" onClick={() => run(() => navigator.clipboard.writeText(entry.path))} />
            <MI label="Copy Relative Path" shortcut="Ctrl+M Ctrl+Shift+C" onClick={() => run(() => navigator.clipboard.writeText(relPath(entry.path)))} />
            <Sep />
            <MI label="Rename..." shortcut="F2" onClick={() => run(() => tree.onBeginRename(entry.path))} />
            <MI label="Delete" shortcut="Delete" onClick={() => run(() => tree.onBeginDelete(entry.path, false))} danger />
          </>
        )}
      </motion.div>
    </>
  );
}

// ─── Menu primitives ─────────────────────────────────────────────────────────

function MI({ label, shortcut, onClick, danger = false, disabled = false }: MIProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={[
        "flex w-full items-center justify-between gap-4 px-3 py-[5px] text-left transition-colors duration-75 outline-none",
        disabled
          ? "cursor-default text-zinc-600 pointer-events-none"
          : danger
          ? "text-red-400 hover:bg-red-500/[0.12] cursor-pointer"
          : "text-zinc-300 hover:bg-white/[0.07] hover:text-white cursor-pointer",
      ].join(" ")}
    >
      <span className="truncate">{label}</span>
      {shortcut && (
        <span className={`shrink-0 text-[11px] tabular-nums ${disabled ? "text-zinc-700" : "text-zinc-500"}`}>
          {shortcut}
        </span>
      )}
    </button>
  );
}

function Sep() {
  return <div className="my-[3px] h-px bg-white/[0.05]" />;
}
