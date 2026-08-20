import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "motion/react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  baseName,
  clipboardPasteInto,
  clipboardProbe,
  clipboardWritePaths,
  copyIntoDir,
  dirName,
  isTauri,
  openInTerminal,
  revealInExplorer,
  type CopiedEntry,
} from "../lib/fs";
import { FileTypeIcon, FolderTypeIcon } from "../lib/icons";
import { Chevron, CheckGlyph, CloseGlyph } from "../icons";
import { useSetting } from "../lib/settings";
import { useExplorer } from "../lib/explorer/useExplorer";
import { useGitDecorations, type GitDecoration } from "../lib/explorer/gitDecorations";
import {
  ancestorsOf,
  BASE_PADDING,
  INDENT,
  isWithinOrEqual,
  ROW_HEIGHT,
  targetDirOf,
} from "../lib/explorer/model";
import type { FileTreeProps, MenuEntry, MenuState, TreeRow } from "../types";

const OVERSCAN = 10;
const TYPEAHEAD_RESET_MS = 900;
const DRAG_MIME = "application/x-aether-paths";

type Clipboard = { paths: string[]; operation: "copy" | "cut" } | null;

type DisplayRow =
  | { kind: "node"; row: TreeRow }
  | { kind: "create"; depth: number; isDir: boolean };

/** A compacted row stands in for every folder in its chain, not just the tail. */
function rowOwns(row: TreeRow, path: string | null): boolean {
  if (!path) return false;
  return row.path === path || !!row.segments?.some((segment) => segment.path === path);
}

function samePathSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a.map((p) => p.replace(/\\/g, "/")));
  return b.every((p) => set.has(p.replace(/\\/g, "/")));
}

export default function FileTree({
  rootPath,
  actions,
  expanded,
  onToggle,
  onExpandPaths,
  refreshNonce,
  onRefresh,
  onChangeWorkspace,
  onGoHome,
  onOpenSearch,
  onTargetDirChange,
  onError,
}: FileTreeProps) {
  const compactFolders = useSetting("explorerCompactFolders");
  const autoReveal = useSetting("explorerAutoReveal");
  const gitDecorationsEnabled = useSetting("explorerGitDecorations");

  const model = useExplorer(rootPath, expanded, refreshNonce, compactFolders);
  const git = useGitDecorations(rootPath, gitDecorationsEnabled, refreshNonce);

  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [anchorPath, setAnchorPath] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<Clipboard>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dragPaths, setDragPaths] = useState<readonly string[]>([]);
  const [dragOverDir, setDragOverDir] = useState<string | null>(null);
  const [typeahead, setTypeahead] = useState("");
  const [systemClipboardReady, setSystemClipboardReady] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const typeaheadTimer = useRef(0);

  const { rows } = model;

  const indexOfPath = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, i) => map.set(row.path, i));
    return map;
  }, [rows]);

  useEffect(() => {
    setSelected(new Set());
    setFocusPath(null);
    setAnchorPath(null);
    setClipboard(null);
  }, [rootPath]);

  useEffect(() => () => window.clearTimeout(typeaheadTimer.current), []);

  // ── viewport ────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    observer.observe(el);
    setViewportHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  const scrollIndexIntoView = useCallback((index: number) => {
    const el = scrollRef.current;
    if (!el || index < 0) return;
    const top = index * ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
    }
  }, []);

  // ── reveal the active editor file ───────────────────────────────────
  const activePath = actions.activePath;
  useEffect(() => {
    if (!autoReveal || !activePath) return;
    const missing = ancestorsOf(activePath, rootPath).filter((p) => !expanded.has(p));
    if (missing.length) onExpandPaths(missing);
  }, [autoReveal, activePath, rootPath, expanded, onExpandPaths]);

  useEffect(() => {
    if (!autoReveal || !activePath) return;
    const index = indexOfPath.get(activePath);
    if (index !== undefined) scrollIndexIntoView(index);
  }, [autoReveal, activePath, indexOfPath, scrollIndexIntoView]);

  // ── rows to paint, including the inline "new file" input ────────────
  const creating = actions.creating;
  const displayRows = useMemo<DisplayRow[]>(() => {
    const out: DisplayRow[] = [];
    if (creating && creating.parentPath === rootPath) {
      out.push({ kind: "create", depth: 0, isDir: creating.isDir });
    }
    for (const row of rows) {
      out.push({ kind: "node", row });
      if (creating && row.isDir && rowOwns(row, creating.parentPath)) {
        out.push({ kind: "create", depth: row.depth + 1, isDir: creating.isDir });
      }
    }
    return out;
  }, [rows, creating, rootPath]);

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(
    displayRows.length,
    Math.ceil((scrollTop + (viewportHeight || 600)) / ROW_HEIGHT) + OVERSCAN,
  );

  // ── selection ───────────────────────────────────────────────────────
  const selectOnly = useCallback((path: string) => {
    setSelected(new Set([path]));
    setFocusPath(path);
    setAnchorPath(path);
  }, []);

  const selectRange = useCallback(
    (to: string) => {
      const a = indexOfPath.get(anchorPath ?? to);
      const b = indexOfPath.get(to);
      if (a === undefined || b === undefined) return;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const next = new Set<string>();
      for (let i = lo; i <= hi; i++) next.add(rows[i].path);
      setSelected(next);
      setFocusPath(to);
    },
    [anchorPath, indexOfPath, rows],
  );

  const moveFocus = useCallback(
    (index: number, mode: "select" | "extend" | "keep") => {
      const row = rows[index];
      if (!row) return;
      scrollIndexIntoView(index);
      if (mode === "extend") selectRange(row.path);
      else if (mode === "keep") setFocusPath(row.path);
      else selectOnly(row.path);
    },
    [rows, scrollIndexIntoView, selectRange, selectOnly],
  );

  const focusRow = focusPath ? rows[indexOfPath.get(focusPath) ?? -1] ?? null : null;
  const focusIndex = focusPath ? indexOfPath.get(focusPath) ?? -1 : -1;

  const selectedPaths = useMemo(
    () => rows.filter((r) => selected.has(r.path)).map((r) => r.path),
    [rows, selected],
  );

  // ── activation ──────────────────────────────────────────────────────
  const activate = useCallback(
    (row: TreeRow) => {
      if (row.isDir) onToggle(row.path);
      else actions.onOpenFile(row.path);
    },
    [onToggle, actions],
  );

  // ── clipboard ───────────────────────────────────────────────────────

  /** Reveals, records and selects whatever a copy or paste just produced. */
  const applyCreated = useCallback(
    (created: CopiedEntry[], dir: string) => {
      for (const entry of created) {
        if (entry.from) actions.onRecord({ kind: "copy", from: entry.from, to: entry.to });
        else actions.onRecord({ kind: "create", to: entry.to, isDir: false });
      }
      if (created.length) {
        if (dir !== rootPath) onExpandPaths([dir]);
        setSelected(new Set(created.map((c) => c.to)));
        setFocusPath(created[created.length - 1].to);
      }
      onRefresh();
    },
    [actions, onExpandPaths, onRefresh, rootPath],
  );

  const copyInto = useCallback(
    async (sources: readonly string[], dir: string) => {
      const usable = sources.filter((source) => !isWithinOrEqual(dir, source));
      if (!usable.length) return;
      try {
        applyCreated(await copyIntoDir(usable, dir), dir);
      } catch (err) {
        onError?.(String(err));
      }
    },
    [applyCreated, onError],
  );

  const setClipboardPaths = useCallback((paths: string[], operation: "copy" | "cut") => {
    if (!paths.length) return;
    setClipboard({ paths, operation });
    // Mirrored to the OS so the same selection can be pasted into Explorer.
    void clipboardWritePaths(paths).catch(() => {});
  }, []);

  /**
   * The system clipboard wins unless it still holds exactly what this explorer
   * put there, in which case the in-app buffer is used so a cut stays a move.
   */
  const pasteInto = useCallback(
    async (dir: string) => {
      const probe = isTauri
        ? await clipboardProbe().catch(() => ({ kind: "none" as const, paths: [] }))
        : { kind: "none" as const, paths: [] };
      const ownsSystemClipboard =
        !!clipboard && (probe.kind === "none" || samePathSet(probe.paths, clipboard.paths));

      if (clipboard && ownsSystemClipboard) {
        if (clipboard.operation === "cut") {
          for (const source of clipboard.paths) {
            if (!isWithinOrEqual(dir, source)) actions.onMoveEntry(source, dir);
          }
          setClipboard(null);
          return;
        }
        await copyInto(clipboard.paths, dir);
        return;
      }

      if (probe.kind !== "none") {
        try {
          applyCreated(await clipboardPasteInto(dir), dir);
        } catch (err) {
          onError?.(String(err));
        }
        return;
      }

      if (clipboard) await copyInto(clipboard.paths, dir);
    },
    [clipboard, copyInto, applyCreated, actions, onError],
  );

  const copySelectionPaths = useCallback(
    (relative: boolean) => {
      const paths = selectedPaths.length ? selectedPaths : focusPath ? [focusPath] : [];
      if (!paths.length) return;
      const root = rootPath.replace(/[/\\]+$/, "");
      const text = paths
        .map((p) => (relative && p.startsWith(root) ? p.slice(root.length).replace(/^[/\\]/, "") : p))
        .join("\n");
      void navigator.clipboard.writeText(text);
    },
    [selectedPaths, focusPath, rootPath],
  );

  // ── drag and drop ───────────────────────────────────────────────────
  const dropInto = useCallback(
    (event: React.DragEvent, dir: string) => {
      event.preventDefault();
      event.stopPropagation();
      setDragOverDir(null);
      setDragPaths([]);

      const raw = event.dataTransfer.getData(DRAG_MIME) || event.dataTransfer.getData("text/plain");
      if (!raw) return;
      const sources: string[] = raw.startsWith("[") ? JSON.parse(raw) : [raw];
      const movable = sources.filter((s) => !isWithinOrEqual(dir, s));
      if (event.ctrlKey || event.altKey) {
        void copyInto(movable, dir);
        return;
      }
      for (const source of movable) {
        if (dirName(source) !== dir) actions.onMoveEntry(source, dir);
      }
    },
    [actions, copyInto],
  );

  const dragOverInto = useCallback(
    (event: React.DragEvent, dir: string) => {
      if (dragPaths.some((source) => isWithinOrEqual(dir, source))) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = event.ctrlKey || event.altKey ? "copy" : "move";
      setDragOverDir(dir);
    },
    [dragPaths],
  );

  /**
   * Files dragged in from the OS never reach the DOM — the webview swallows
   * them — so the drop target is resolved by hit-testing the pointer against
   * the rendered rows instead.
   */
  const dirAtPoint = useCallback(
    (position: { x: number; y: number }): string | null => {
      const container = scrollRef.current;
      if (!container) return null;
      const ratio = window.devicePixelRatio || 1;
      const x = position.x / ratio;
      const y = position.y / ratio;
      const bounds = container.getBoundingClientRect();
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
      const target = document.elementFromPoint(x, y) as HTMLElement | null;
      return target?.closest<HTMLElement>("[data-drop-dir]")?.dataset.dropDir ?? rootPath;
    },
    [rootPath],
  );

  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "leave") {
          setDragOverDir(null);
          return;
        }
        const dir = dirAtPoint(payload.position);
        if (payload.type === "drop") {
          setDragOverDir(null);
          if (dir) void copyInto(payload.paths, dir);
          return;
        }
        setDragOverDir(dir);
      })
      .then((dispose) => {
        if (cancelled) dispose();
        else unlisten = dispose;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [dirAtPoint, copyInto]);

  // ── keyboard ────────────────────────────────────────────────────────
  const runTypeahead = useCallback(
    (char: string) => {
      const next = typeahead + char.toLowerCase();
      setTypeahead(next);
      window.clearTimeout(typeaheadTimer.current);
      typeaheadTimer.current = window.setTimeout(() => setTypeahead(""), TYPEAHEAD_RESET_MS);

      const start = focusIndex + (next.length > 1 ? 0 : 1);
      for (let step = 0; step < rows.length; step++) {
        const index = (start + step + rows.length) % rows.length;
        if (baseName(rows[index].path).toLowerCase().startsWith(next)) {
          moveFocus(index, "select");
          return;
        }
      }
    },
    [typeahead, focusIndex, rows, moveFocus],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.target as HTMLElement).tagName === "INPUT") return;
      const mod = event.ctrlKey || event.metaKey;
      const pageSize = Math.max(1, Math.floor((viewportHeight || ROW_HEIGHT * 10) / ROW_HEIGHT) - 1);
      const mode = event.shiftKey ? "extend" : mod ? "keep" : "select";

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          moveFocus(Math.min(rows.length - 1, focusIndex + 1), mode);
          return;
        case "ArrowUp":
          event.preventDefault();
          moveFocus(Math.max(0, focusIndex - 1), mode);
          return;
        case "PageDown":
          event.preventDefault();
          moveFocus(Math.min(rows.length - 1, focusIndex + pageSize), mode);
          return;
        case "PageUp":
          event.preventDefault();
          moveFocus(Math.max(0, focusIndex - pageSize), mode);
          return;
        case "Home":
          event.preventDefault();
          moveFocus(0, mode);
          return;
        case "End":
          event.preventDefault();
          moveFocus(rows.length - 1, mode);
          return;
        case "ArrowRight":
          event.preventDefault();
          if (!focusRow) return;
          if (focusRow.isDir && !focusRow.expanded) onToggle(focusRow.path);
          else if (focusRow.isDir) moveFocus(focusIndex + 1, "select");
          return;
        case "ArrowLeft": {
          event.preventDefault();
          if (!focusRow) return;
          if (focusRow.isDir && focusRow.expanded) {
            onToggle(focusRow.path);
            return;
          }
          const parent = indexOfPath.get(focusRow.parentPath);
          if (parent !== undefined) moveFocus(parent, "select");
          return;
        }
        case "Enter":
        case " ":
          event.preventDefault();
          if (focusRow) activate(focusRow);
          return;
        case "Escape":
          event.preventDefault();
          setSelected(new Set());
          setTypeahead("");
          return;
        case "F2":
          event.preventDefault();
          if (focusRow) actions.onBeginRename(focusRow.path);
          return;
        case "Delete":
          event.preventDefault();
          if (focusRow) actions.onBeginDelete(focusRow.path, focusRow.isDir);
          return;
        case "ContextMenu":
          event.preventDefault();
          if (focusRow) {
            const el = scrollRef.current?.getBoundingClientRect();
            setMenu({
              x: (el?.left ?? 0) + 24,
              y: (el?.top ?? 0) + (focusIndex * ROW_HEIGHT - scrollTop) + ROW_HEIGHT,
              row: focusRow,
              targetPath: focusRow.path,
            });
          }
          return;
      }

      if (mod && !event.shiftKey) {
        const key = event.key.toLowerCase();
        if (key === "a") {
          event.preventDefault();
          setSelected(new Set(rows.map((r) => r.path)));
          return;
        }
        if (key === "c" && selectedPaths.length) {
          event.preventDefault();
          setClipboardPaths(selectedPaths, "copy");
          return;
        }
        if (key === "x" && selectedPaths.length) {
          event.preventDefault();
          setClipboardPaths(selectedPaths, "cut");
          return;
        }
        if (key === "v") {
          event.preventDefault();
          void pasteInto(targetDirOf(focusRow, rootPath));
          return;
        }
        if (key === "z") {
          event.preventDefault();
          actions.onUndo();
          return;
        }
        if (key === "y") {
          event.preventDefault();
          actions.onRedo();
          return;
        }
      }

      if (mod && event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        actions.onRedo();
        return;
      }

      if (!mod && !event.altKey && event.key.length === 1 && event.key !== " ") {
        event.preventDefault();
        runTypeahead(event.key);
      }
    },
    [
      rows,
      focusRow,
      focusIndex,
      indexOfPath,
      viewportHeight,
      scrollTop,
      moveFocus,
      onToggle,
      activate,
      actions,
      selectedPaths,
      setClipboardPaths,
      pasteInto,
      rootPath,
      runTypeahead,
    ],
  );

  // ── row interaction ─────────────────────────────────────────────────
  const onRowClick = useCallback(
    (event: React.MouseEvent, row: TreeRow) => {
      if (event.shiftKey) {
        selectRange(row.path);
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        const next = new Set(selected);
        if (next.has(row.path)) next.delete(row.path);
        else next.add(row.path);
        setSelected(next);
        setFocusPath(row.path);
        setAnchorPath(row.path);
        return;
      }
      selectOnly(row.path);
      activate(row);
    },
    [selectRange, selected, selectOnly, activate],
  );

  const openMenuFor = useCallback(
    (event: React.MouseEvent, row: TreeRow | null, targetPath: string | null) => {
      event.preventDefault();
      event.stopPropagation();
      if (row && !selected.has(row.path)) selectOnly(row.path);
      setMenu({ x: event.clientX, y: event.clientY, row, targetPath });
      if (isTauri) {
        void clipboardProbe()
          .then((probe) => setSystemClipboardReady(probe.kind !== "none"))
          .catch(() => setSystemClipboardReady(false));
      }
    },
    [selected, selectOnly],
  );

  const menuHandlers = useMemo<MenuHandlers>(
    () => ({
      newFile: (dir) => actions.onBeginCreate(dir, false),
      newFolder: (dir) => actions.onBeginCreate(dir, true),
      open: (path) => actions.onOpenFile(path),
      reveal: (path) => void revealInExplorer(path),
      terminal: (dir) => void openInTerminal(dir),
      search: (dir) => onOpenSearch?.(dir),
      cut: () => setClipboardPaths(selectedPaths, "cut"),
      copy: () => setClipboardPaths(selectedPaths, "copy"),
      paste: (dir) => void pasteInto(dir),
      copyPath: () => copySelectionPaths(false),
      copyRelativePath: () => copySelectionPaths(true),
      rename: (path) => actions.onBeginRename(path),
      remove: (path, isDir) => actions.onBeginDelete(path, isDir),
      undo: actions.onUndo,
      redo: actions.onRedo,
      refresh: onRefresh,
      changeWorkspace: onChangeWorkspace,
      goHome: onGoHome,
    }),
    [actions, onOpenSearch, selectedPaths, setClipboardPaths, pasteInto, copySelectionPaths, onRefresh, onChangeWorkspace, onGoHome],
  );

  useEffect(() => {
    onTargetDirChange?.(targetDirOf(focusRow, rootPath));
  }, [focusRow, rootPath, onTargetDirChange]);

  const closeMenu = useCallback(() => {
    setMenu(null);
    scrollRef.current?.focus();
  }, []);

  const paintRows = displayRows.slice(first, last);

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      role="tree"
      aria-label="Files"
      aria-multiselectable
      aria-activedescendant={focusPath ? `tree-${focusPath}` : undefined}
      onKeyDown={onKeyDown}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.treeSurface) {
          setSelected(new Set());
          setFocusPath(null);
        }
      }}
      onContextMenu={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.treeSurface) {
          openMenuFor(e, null, null);
        }
      }}
      onDragOver={(e) => dragOverInto(e, rootPath)}
      onDragLeave={(e) => {
        if (e.target === e.currentTarget) setDragOverDir(null);
      }}
      onDrop={(e) => dropInto(e, rootPath)}
      className={[
        "scroll-thin relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden text-zinc-300 outline-none select-none",
        dragOverDir === rootPath ? "ring-1 ring-inset ring-accent/30" : "",
      ].join(" ")}
    >
      {model.error && <p className="px-3 py-2 text-xs text-red-400/80">{model.error}</p>}
      {!model.error && !model.ready && <SkeletonRows />}
      {model.ready && displayRows.length === 0 && (
        <p className="px-3 py-2 text-xs text-zinc-500">This folder is empty.</p>
      )}

      <div data-tree-surface="1" style={{ height: displayRows.length * ROW_HEIGHT }} className="relative w-full">
        {paintRows.map((item, i) => {
          const top = (first + i) * ROW_HEIGHT;
          if (item.kind === "create") {
            return (
              <InlineEditRow
                key="create"
                top={top}
                depth={item.depth}
                isDir={item.isDir}
                mode="create"
                onCommit={actions.onCommitCreate}
                onCancel={actions.onCancelCreate}
              />
            );
          }
          const { row } = item;
          if (rowOwns(row, actions.renamingPath)) {
            return (
              <InlineEditRow
                key={row.key}
                top={top}
                depth={row.depth}
                isDir={row.isDir}
                mode="rename"
                initialValue={baseName(actions.renamingPath as string)}
                onCommit={actions.onCommitRename}
                onCancel={actions.onCancelRename}
              />
            );
          }
          if (rowOwns(row, actions.deletingPath)) {
            return (
              <DeleteConfirmRow
                key={row.key}
                top={top}
                depth={row.depth}
                isDir={row.isDir}
                name={baseName(actions.deletingPath as string)}
                onConfirm={actions.onConfirmDelete}
                onCancel={actions.onCancelDelete}
              />
            );
          }
          return (
            <Row
              key={row.key}
              row={row}
              top={top}
              active={!row.isDir && row.path === activePath}
              selected={selected.has(row.path)}
              focused={row.path === focusPath}
              cut={clipboard?.operation === "cut" && clipboard.paths.includes(row.path)}
              dragging={dragPaths.includes(row.path)}
              dropTarget={dragOverDir === row.path}
              decoration={git.of(row.path, row.isDir)}
              onClick={onRowClick}
              onContextMenu={openMenuFor}
              onDragStart={(event) => {
                const paths = selected.has(row.path) && selectedPaths.length > 1 ? selectedPaths : [row.path];
                if (!selected.has(row.path)) selectOnly(row.path);
                setDragPaths(paths);
                event.dataTransfer.setData(DRAG_MIME, JSON.stringify(paths));
                event.dataTransfer.setData("text/plain", paths[0]);
                event.dataTransfer.effectAllowed = "copyMove";
              }}
              onDragEnd={() => {
                setDragPaths([]);
                setDragOverDir(null);
              }}
              onDragOver={dragOverInto}
              onDrop={dropInto}
            />
          );
        })}
      </div>

      {typeahead && (
        <div className="pointer-events-none sticky bottom-1 z-10 mx-2 w-fit rounded bg-abyss/95 px-2 py-1 font-mono text-[11px] text-zinc-300 shadow-lg shadow-black/60">
          {typeahead}
        </div>
      )}

      {menu && (
        <ContextMenu
          menu={menu}
          rootPath={rootPath}
          canPaste={!!clipboard || systemClipboardReady}
          selectionCount={selectedPaths.length}
          canUndo={actions.canUndo}
          canRedo={actions.canRedo}
          canSearch={!!onOpenSearch}
          onClose={closeMenu}
          onAction={menuHandlers}
        />
      )}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

interface RowProps {
  row: TreeRow;
  top: number;
  active: boolean;
  selected: boolean;
  focused: boolean;
  cut: boolean;
  dragging: boolean;
  dropTarget: boolean;
  decoration: GitDecoration | null;
  onClick: (event: React.MouseEvent, row: TreeRow) => void;
  onContextMenu: (event: React.MouseEvent, row: TreeRow, targetPath: string) => void;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent, dir: string) => void;
  onDrop: (event: React.DragEvent, dir: string) => void;
}

const Row = memo(function Row({
  row,
  top,
  active,
  selected,
  focused,
  cut,
  dragging,
  dropTarget,
  decoration,
  onClick,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: RowProps) {
  const dropDir = row.isDir ? row.path : row.parentPath;
  const tone = selected
    ? "bg-white/[0.08] text-zinc-100"
    : active
    ? "bg-white/[0.05] text-white"
    : "text-zinc-400 hover:bg-white/[0.035] hover:text-zinc-200";

  return (
    <div
      id={`tree-${row.path}`}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-expanded={row.isDir ? row.expanded : undefined}
      title={row.path}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, dropDir)}
      onDrop={(e) => onDrop(e, dropDir)}
      onClick={(e) => onClick(e, row)}
      onContextMenu={(e) => onContextMenu(e, row, row.path)}
      data-drop-dir={dropDir}
      style={{ top, height: ROW_HEIGHT, paddingLeft: BASE_PADDING + row.depth * INDENT }}
      className={[
        "group absolute inset-x-0 flex cursor-pointer items-center gap-1.5 pr-2 text-[13px] transition-colors duration-75",
        tone,
        dropTarget ? "bg-accent/10 ring-1 ring-inset ring-accent/50" : "",
        dragging ? "opacity-40" : "",
        cut ? "opacity-50" : "",
      ].join(" ")}
    >
      {active && !selected && <span className="absolute inset-y-0 left-0 w-[2px] bg-accent" />}
      {focused && <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/20" />}

      <span className="flex w-3 shrink-0 justify-center text-zinc-500 group-hover:text-zinc-300">
        {row.isDir && <Chevron open={row.expanded} />}
      </span>

      {row.isDir ? (
        <FolderTypeIcon name={baseName(row.path)} open={row.expanded} className="shrink-0" />
      ) : (
        <FileTypeIcon name={row.name} className="shrink-0" />
      )}

      <span className={`truncate ${decoration ? decoration.className : ""}`}>
        {row.segments ? <CompactName segments={row.segments} onPick={onContextMenu} row={row} /> : row.name}
      </span>

      {decoration?.letter && (
        <span
          title={decoration.label}
          className={`ml-auto shrink-0 pl-1 font-mono text-[11px] ${decoration.className}`}
        >
          {decoration.letter}
        </span>
      )}
      {decoration && !decoration.letter && (
        <span title={decoration.label} className={`ml-auto shrink-0 pl-1 text-[13px] ${decoration.className}`}>
          •
        </span>
      )}
    </div>
  );
});

/** Renders `src/lib/icons` so each folder in a compacted chain stays targetable. */
function CompactName({
  segments,
  row,
  onPick,
}: {
  segments: NonNullable<TreeRow["segments"]>;
  row: TreeRow;
  onPick: (event: React.MouseEvent, row: TreeRow, targetPath: string) => void;
}) {
  return (
    <>
      {segments.map((segment, i) => (
        <span key={segment.path}>
          {i > 0 && <span className="text-zinc-600">/</span>}
          <span
            onContextMenu={(e) => onPick(e, row, segment.path)}
            className="hover:text-zinc-100"
          >
            {segment.name}
          </span>
        </span>
      ))}
    </>
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

// ─── Inline editing ───────────────────────────────────────────────────────────

function InlineEditRow({
  top,
  depth,
  mode,
  isDir,
  initialValue = "",
  onCommit,
  onCancel,
}: {
  top: number;
  depth: number;
  mode: "create" | "rename";
  isDir: boolean;
  initialValue?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const dot = initialValue.lastIndexOf(".");
      el.setSelectionRange(0, mode === "rename" && dot > 0 ? dot : initialValue.length);
    });
    return () => cancelAnimationFrame(id);
  }, [mode, initialValue]);

  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel();
  };

  // Guards the ghost `blur` the browser fires when Enter unmounts the input.
  const commit = () => {
    if (settledRef.current) return;
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialValue) {
      cancel();
      return;
    }
    settledRef.current = true;
    onCommit(trimmed);
  };

  return (
    <div
      style={{ top, height: ROW_HEIGHT, paddingLeft: BASE_PADDING + depth * INDENT }}
      className="absolute inset-x-0 flex items-center gap-1.5 pr-2 text-[13px]"
    >
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
          e.stopPropagation();
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

function DeleteConfirmRow({
  top,
  depth,
  isDir,
  name,
  onConfirm,
  onCancel,
}: {
  top: number;
  depth: number;
  isDir: boolean;
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const focusId = requestAnimationFrame(() => confirmRef.current?.focus());
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    const onMouseDown = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) onCancel();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      cancelAnimationFrame(focusId);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [onCancel]);

  return (
    <div
      ref={rowRef}
      style={{ top, height: ROW_HEIGHT, paddingLeft: BASE_PADDING + depth * INDENT }}
      className="absolute inset-x-0 flex items-center gap-1.5 bg-red-500/[0.07] pr-1.5 text-[13px]"
    >
      <span className="inline-block w-3 shrink-0" />
      {isDir ? (
        <FolderTypeIcon name={name} open={false} className="shrink-0" />
      ) : (
        <FileTypeIcon name={name} className="shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate text-red-300">Delete "{name}"?</span>
      <button
        ref={confirmRef}
        type="button"
        title="Confirm delete"
        onClick={onConfirm}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
      >
        <CheckGlyph size={12} />
      </button>
      <button
        type="button"
        title="Cancel"
        onClick={onCancel}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-200"
      >
        <CloseGlyph size={11} />
      </button>
    </div>
  );
}

// ─── Context menu ─────────────────────────────────────────────────────────────

interface MenuHandlers {
  newFile: (dir: string) => void;
  newFolder: (dir: string) => void;
  open: (path: string) => void;
  reveal: (path: string) => void;
  terminal: (dir: string) => void;
  search: (dir: string) => void;
  cut: () => void;
  copy: () => void;
  paste: (dir: string) => void;
  copyPath: () => void;
  copyRelativePath: () => void;
  rename: (path: string) => void;
  remove: (path: string, isDir: boolean) => void;
  undo: () => void;
  redo: () => void;
  refresh: () => void;
  changeWorkspace: () => void;
  goHome: () => void;
}

const MENU_WIDTH = 250;

function ContextMenu({
  menu,
  rootPath,
  canPaste,
  selectionCount,
  canUndo,
  canRedo,
  canSearch,
  onClose,
  onAction,
}: {
  menu: MenuState;
  rootPath: string;
  canPaste: boolean;
  selectionCount: number;
  canUndo: boolean;
  canRedo: boolean;
  canSearch: boolean;
  onClose: () => void;
  onAction: MenuHandlers;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: menu.x, top: menu.y });
  const [cursor, setCursor] = useState(-1);

  const target = menu.targetPath ?? rootPath;
  const isDir = menu.row ? menu.row.isDir || target !== menu.row.path : true;
  const pasteDir = isDir ? target : dirName(target);
  const plural = selectionCount > 1 ? ` (${selectionCount})` : "";

  const entries = useMemo<MenuEntry[]>(() => {
    const run = (fn: () => void) => () => {
      fn();
      onClose();
    };
    const items: MenuEntry[] = [];

    if (!menu.row) {
      items.push(
        { id: "new-file", label: "New File…", run: run(() => onAction.newFile(rootPath)) },
        { id: "new-folder", label: "New Folder…", run: run(() => onAction.newFolder(rootPath)) },
        { id: "s1", separator: true },
        { id: "paste", label: "Paste", shortcut: "Ctrl+V", disabled: !canPaste, run: run(() => onAction.paste(rootPath)) },
        { id: "s2", separator: true },
        { id: "refresh", label: "Refresh Explorer", run: run(onAction.refresh) },
        { id: "reveal", label: "Reveal in File Explorer", run: run(() => onAction.reveal(rootPath)) },
        { id: "terminal", label: "Open in Integrated Terminal", run: run(() => onAction.terminal(rootPath)) },
        { id: "s3", separator: true },
        { id: "workspace", label: "Change Workspace Folder…", run: run(onAction.changeWorkspace) },
        { id: "home", label: "Go to Homepage", run: run(onAction.goHome) },
      );
      return items;
    }

    if (isDir) {
      items.push(
        { id: "new-file", label: "New File…", run: run(() => onAction.newFile(target)) },
        { id: "new-folder", label: "New Folder…", run: run(() => onAction.newFolder(target)) },
        { id: "s1", separator: true },
      );
    } else {
      items.push(
        { id: "open", label: "Open", shortcut: "Enter", run: run(() => onAction.open(target)) },
        { id: "s1", separator: true },
      );
    }

    items.push(
      { id: "reveal", label: "Reveal in File Explorer", run: run(() => onAction.reveal(target)) },
      { id: "terminal", label: "Open in Integrated Terminal", run: run(() => onAction.terminal(pasteDir)) },
    );
    if (canSearch) {
      items.push({ id: "search", label: "Find in Folder…", run: run(() => onAction.search(pasteDir)) });
    }
    items.push(
      { id: "s2", separator: true },
      { id: "cut", label: `Cut${plural}`, shortcut: "Ctrl+X", run: run(onAction.cut) },
      { id: "copy", label: `Copy${plural}`, shortcut: "Ctrl+C", run: run(onAction.copy) },
      { id: "paste", label: "Paste", shortcut: "Ctrl+V", disabled: !canPaste, run: run(() => onAction.paste(pasteDir)) },
      { id: "s3", separator: true },
      { id: "copy-path", label: "Copy Path", run: run(onAction.copyPath) },
      { id: "copy-rel", label: "Copy Relative Path", run: run(onAction.copyRelativePath) },
      { id: "s4", separator: true },
      { id: "undo", label: "Undo", shortcut: "Ctrl+Z", disabled: !canUndo, run: run(onAction.undo) },
      { id: "redo", label: "Redo", shortcut: "Ctrl+Y", disabled: !canRedo, run: run(onAction.redo) },
      { id: "s5", separator: true },
      { id: "rename", label: "Rename…", shortcut: "F2", run: run(() => onAction.rename(target)) },
      { id: "delete", label: "Delete", shortcut: "Del", danger: true, run: run(() => onAction.remove(target, isDir)) },
    );
    return items;
  }, [menu.row, isDir, target, pasteDir, plural, canPaste, canUndo, canRedo, canSearch, rootPath, onAction, onClose]);

  const actionable = entries
    .map((entry, index) => ({ entry, index }))
    .filter((e) => !("separator" in e.entry) && !e.entry.disabled);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPosition({
      left: Math.max(4, Math.min(menu.x, window.innerWidth - width - 4)),
      top: Math.max(4, Math.min(menu.y, window.innerHeight - height - 4)),
    });
  }, [menu.x, menu.y, entries.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const consume = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (e.key === "Escape") {
        consume();
        onClose();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        consume();
        if (!actionable.length) return;
        const down = e.key === "ArrowDown";
        const current = actionable.findIndex((a) => a.index === cursor);
        const next =
          current < 0
            ? down
              ? 0
              : actionable.length - 1
            : (current + (down ? 1 : -1) + actionable.length) % actionable.length;
        setCursor(actionable[next].index);
        return;
      }
      if (e.key === "Enter") {
        consume();
        const entry = entries[cursor];
        if (entry && !("separator" in entry) && !entry.disabled) entry.run();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [entries, actionable, cursor, onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <motion.div
        ref={ref}
        role="menu"
        initial={{ opacity: 0, scale: 0.97, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.08 }}
        style={{ left: position.left, top: position.top, width: MENU_WIDTH }}
        className="fixed z-50 overflow-hidden rounded-lg border border-white/[0.05] bg-[#0d0d0d] py-1 text-[13px] shadow-[0_8px_40px_rgba(0,0,0,0.85)]"
      >
        {entries.map((entry, index) =>
          "separator" in entry ? (
            <div key={entry.id} className="my-[3px] h-px bg-white/[0.05]" />
          ) : (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              disabled={entry.disabled}
              onMouseEnter={() => setCursor(index)}
              onClick={entry.run}
              className={[
                "flex w-full items-center justify-between gap-4 px-3 py-[5px] text-left outline-none transition-colors duration-75",
                entry.disabled
                  ? "pointer-events-none cursor-default text-zinc-600"
                  : entry.danger
                  ? "cursor-pointer text-red-400"
                  : "cursor-pointer text-zinc-300",
                !entry.disabled && index === cursor
                  ? entry.danger
                    ? "bg-red-500/[0.12]"
                    : "bg-white/[0.07] text-white"
                  : "",
              ].join(" ")}
            >
              <span className="truncate">{entry.label}</span>
              {entry.shortcut && (
                <span
                  className={`shrink-0 text-[11px] tabular-nums ${entry.disabled ? "text-zinc-700" : "text-zinc-500"}`}
                >
                  {entry.shortcut}
                </span>
              )}
            </button>
          ),
        )}
      </motion.div>
    </>
  );
}
