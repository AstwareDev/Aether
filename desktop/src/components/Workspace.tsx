import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import {
  baseName,
  createEntry,
  deleteEntry,
  dirName,
  extensionOf,
  joinPath,
  listFiles,
  readFileText,
  renameEntry,
  writeFileText,
} from "../lib/fs";
import type { IndexedFile, ReviewIssue } from "../types";
import { useFsHistory } from "../lib/explorer/history";
import { setWorkspaceContext } from "../lib/workspace";
import { folderName } from "../lib/recentFolders";
import { languageLabelForPath } from "../lib/languageLabel";
import { getIconTheme, iconThemes } from "../lib/icons";
import { setSetting, useSetting } from "../lib/settings";
import type { Command, TreeActions, ViewId, OpenTab, CursorPos, PaletteMode, WorkspaceProps, FileBuffer, SettingsSection, OpenEditorsProps, EditorGroup, DropZone } from "../types";
import { blankBrowserUrl, browserLabel, browserPath, fileUrl, isBrowserPath, normalizeUrl, urlFromBrowserPath } from "../lib/browser";
import { destroyBrowserView } from "../lib/browserHost";
import { TAB_DND_TYPE } from "../lib/dnd";
import Sidebar from "./Sidebar";
import SettingsPanel from "./SettingsPanel";
import EditorTabs from "./EditorTabs";
import Breadcrumbs from "./Breadcrumbs";
import StatusBar from "./StatusBar";
import CommandPalette from "./CommandPalette";

import {
  NewFileIcon,
  NewFolderIcon,
  RefreshIcon,
  CollapseAllIcon,
  SidebarIcon,
  TerminalIcon,
  GoToFileIcon,
  SettingsIcon,
  FilesIcon,
  ScmIcon,
  ExtensionsIcon,
  SearchIcon,
  ErrorIcon,
  BrowserIcon,
  SplitIcon,
} from "../lib/icons/ui";
import { CloseGlyph } from "../icons";

// Monaco + language grammars are the heaviest dependency; only load them
// once a file is actually opened.
const CodeEditor = lazy(() => import("./CodeEditor"));
const ImageViewer = lazy(() => import("./ImageViewer"));
const PdfViewer = lazy(() => import("./PdfViewer"));
const DrawioEditor = lazy(() => import("./DrawioEditor"));
const MarkdownPreview = lazy(() => import("./MarkdownPreview"));
const BrowserView = lazy(() => import("./BrowserView"));
const RichTextEditor = lazy(() => import("./RichTextEditor"));
const MonacoDiffEditor = lazy(() => import("./MonacoDiffEditor"));
// xterm.js is only needed once the panel is actually opened.
const TerminalPanel = lazy(() => import("./TerminalPanel"));

type MarkdownViewMode = "preview" | "rich" | "markdown";

const MARKDOWN_VIEWS: { id: MarkdownViewMode; label: string; title: string }[] = [
  { id: "preview", label: "Preview", title: "Read-only rendered view" },
  { id: "rich", label: "Visual Editor", title: "Format visually without markdown syntax" },
  { id: "markdown", label: "Code", title: "Raw markdown" },
];

function relativeTo(root: string, path: string): string {
  if (!path.startsWith(root)) return baseName(path);
  return path.slice(root.length).replace(/^[\\/]+/, "").replace(/\\/g, "/");
}

async function gitShow(root: string, filePath: string): Promise<string> {
  return invoke<string>("git_show", { root, filePath });
}

const DIFF_PREFIX = "diff:";

function isDiffPath(p: string): boolean {
  return p.startsWith(DIFF_PREFIX);
}

function realPathFromDiff(p: string): string {
  return p.slice(DIFF_PREFIX.length);
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"]);

function isDrawioPath(p: string): boolean {
  if (isDiffPath(p)) return false;
  const name = baseName(p).toLowerCase();
  return extensionOf(p) === "drawio" || name.endsWith(".drawio.svg") || name.endsWith(".drawio.png");
}

function isImagePath(p: string): boolean {
  if (isDiffPath(p) || isDrawioPath(p)) return false;
  return IMAGE_EXTS.has(extensionOf(p));
}

function isPdfPath(p: string): boolean {
  if (isDiffPath(p)) return false;
  return extensionOf(p) === "pdf";
}

function isMarkdownPath(p: string): boolean {
  if (isDiffPath(p)) return false;
  const ext = extensionOf(p);
  return ext === "md" || ext === "markdown";
}

/**
 * Prime/resync the workspace-wide background models used for cross-file
 * auto-import (see lib/monaco/workspaceModels.ts) once the file index loads
 * or changes. This is now the usual trigger for Monaco's first load (rather
 * than opening a file, as before workspace-wide IntelliSense existed) — a
 * deliberate tradeoff for the feature, softened by a dynamic import (so the
 * chunk isn't in the initial app bundle) deferred to idle time (so it never
 * competes with first paint of the file tree).
 */
function scheduleWorkspaceModelSync(files: IndexedFile[]): void {
  const run = () => {
    void import("../lib/monaco/workspaceModels").then(({ syncWorkspaceModels }) => syncWorkspaceModels(files));
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(run);
  else setTimeout(run, 200);
}

const FIRST_GROUP_ID = "g1";

export default function Workspace({ path, onClose, onChangeWorkspace }: WorkspaceProps) {
  const [groups, setGroups] = useState<EditorGroup[]>([{ id: FIRST_GROUP_ID, openPaths: [], activePath: null }]);
  const [activeGroupId, setActiveGroupId] = useState<string>(FIRST_GROUP_ID);
  // Read by handlers that must act on the latest layout without re-running on every change.
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const activeGroupIdRef = useRef(activeGroupId);
  activeGroupIdRef.current = activeGroupId;
  const nextGroupIdRef = useRef(2);
  const newGroupId = useCallback(() => `g${nextGroupIdRef.current++}`, []);
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0];
  const activePath = activeGroup?.activePath ?? null;

  // Drag-to-split: which tab is being dragged and which pane edge it's currently over.
  const [dropZone, setDropZone] = useState<DropZone | null>(null);
  const dropZoneRef = useRef<DropZone | null>(null);
  dropZoneRef.current = dropZone;

  const [buffers, setBuffers] = useState<Record<string, FileBuffer>>({});
  const buffersRef = useRef(buffers);
  buffersRef.current = buffers;
  const [diffBuffers, setDiffBuffers] = useState<Record<string, { original: string; modified: string }>>({});
  const [cursor, setCursor] = useState<CursorPos | null>(null);
  const [markdownPreviewMode, setMarkdownPreviewMode] = useState<Record<string, MarkdownViewMode>>({});

  const [activeView, setActiveView] = useState<ViewId>("explorer");
  const sidebarVisible = useSetting("sidebarVisible");
  const sidebarWidth = useSetting("sidebarWidth");
  const iconTheme = useSetting("iconTheme");
  const terminalVisible = useSetting("terminalVisible");
  const showOpenEditors = useSetting("explorerOpenEditors");
  const openEditorsExpanded = useSetting("explorerOpenEditorsExpanded");
  // Latches true the first time the terminal is opened and never resets, so
  // the shell process survives later hide/show toggles instead of being
  // killed and respawned each time.
  const [terminalMounted, setTerminalMounted] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(260);
  useEffect(() => {
    if (terminalVisible) setTerminalMounted(true);
  }, [terminalVisible]);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [files, setFiles] = useState<IndexedFile[]>([]);
  const [palette, setPalette] = useState<{ open: boolean; mode: PaletteMode }>({ open: false, mode: "files" });
  const [creating, setCreating] = useState<{ parentPath: string; isDir: boolean } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [deletingPath, setDeletingPath] = useState<{ path: string; isDir: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [browserUrls, setBrowserUrls] = useState<Record<string, string>>({});
  const [browserIcons, setBrowserIcons] = useState<Record<string, string | null>>({});
  const [browserTitles, setBrowserTitles] = useState<Record<string, string>>({});
  const [searchScope, setSearchScope] = useState<string | null>(null);
  const history = useFsHistory();

  const openSettings = useCallback((section?: SettingsSection) => {
    if (section) setSettingsSection(section);
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const notify = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((n) => (n === message ? null : n)), 4500);
  }, []);

  const handleChangeWorkspace = useCallback(async () => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauri) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      const { addRecentFolder } = await import("../lib/recentFolders");
      addRecentFolder(selected);
      onChangeWorkspace(selected);
    }
  }, [onChangeWorkspace]);

  // ---- file index (quick-open) ------------------------------------------
  const reloadIndex = useCallback(() => {
    listFiles(path)
      .then((fetched) => {
        setFiles(fetched);
        setWorkspaceContext(path, fetched);
        scheduleWorkspaceModelSync(fetched);
      })
      .catch(() => {
        setFiles([]);
        setWorkspaceContext(path, []);
      });
  }, [path]);

  useEffect(() => {
    reloadIndex();
  }, [reloadIndex]);

  // ---- tab / buffer management ------------------------------------------
  const openFile = useCallback(
    async (filePath: string, opts?: { groupId?: string }) => {
      const groupId = opts?.groupId ?? activeGroupIdRef.current;
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, activePath: filePath, openPaths: g.openPaths.includes(filePath) ? g.openPaths : [...g.openPaths, filePath] }
            : g,
        ),
      );
      setActiveGroupId(groupId);
      // Skip text read for binary previews — they handle their own file reading.
      if (isImagePath(filePath) || isDrawioPath(filePath) || isPdfPath(filePath)) {
        setBuffers((prev) => ({ ...prev, [filePath]: { value: "", saved: "" } }));
        return;
      }
      // Initialize markdown files in preview mode by default
      if (isMarkdownPath(filePath) && !markdownPreviewMode[filePath]) {
        setMarkdownPreviewMode((prev) => ({ ...prev, [filePath]: "preview" }));
      }
      const current = buffersRef.current[filePath];
      if (current && !current.error) return;
      try {
        const text = await readFileText(filePath);
        setBuffers((prev) => ({ ...prev, [filePath]: { value: text, saved: text } }));
      } catch (err) {
        setBuffers((prev) => ({ ...prev, [filePath]: { value: "", saved: "", error: String(err) } }));
      }
    },
    [],
  );

  // Agent Review asks to reveal an issue: open the owning file, then hand the
  // issue to the editor, which owns the inline annotation card.
  useEffect(() => {
    const handler = (e: Event) => {
      const issue = (e as CustomEvent).detail as ReviewIssue | undefined;
      if (!issue) return;
      const filePath = joinPath(path, issue.file);
      void openFile(filePath).then(() => {
        window.dispatchEvent(
          new CustomEvent("aether:show-review-annotation", { detail: { ...issue, path: filePath } }),
        );
      });
    };
    window.addEventListener("aether:reveal-review-issue", handler);
    return () => window.removeEventListener("aether:reveal-review-issue", handler);
  }, [path, openFile]);

  // Removes a path's buffers/side-state once no group has it open any more.
  const cleanupClosedPaths = useCallback((paths: string[]) => {
    if (!paths.length) return;
    const dead = new Set(paths);
    const strip = <T,>(prev: Record<string, T>): Record<string, T> => {
      const next = { ...prev };
      for (const p of dead) delete next[p];
      return next;
    };
    setBuffers(strip);
    setDiffBuffers(strip);
    setMarkdownPreviewMode(strip);
    setBrowserUrls(strip);
    setBrowserIcons(strip);
    setBrowserTitles(strip);
    // The pane's webview is an OS-level layer that outlives the component, so
    // closing the tab has to close it explicitly.
    paths.filter(isBrowserPath).forEach(destroyBrowserView);
  }, []);

  const closeTab = useCallback(
    (filePath: string, groupId: string) => {
      const snapshot = groupsRef.current;
      const idx = snapshot.findIndex((g) => g.id === groupId);
      if (idx === -1) return;
      const g = snapshot[idx];
      const openPaths = g.openPaths.filter((p) => p !== filePath);
      let nextActive = g.activePath;
      if (nextActive === filePath) {
        const oldIdx = g.openPaths.indexOf(filePath);
        nextActive = openPaths[oldIdx] ?? openPaths[oldIdx - 1] ?? openPaths[openPaths.length - 1] ?? null;
      }
      if (openPaths.length === 0 && snapshot.length > 1) {
        const nextGroups = snapshot.filter((_, i) => i !== idx);
        setGroups(nextGroups);
        if (activeGroupIdRef.current === groupId) {
          setActiveGroupId((nextGroups[idx] ?? nextGroups[idx - 1] ?? nextGroups[0]).id);
        }
      } else {
        setGroups(snapshot.map((gr, i) => (i === idx ? { ...gr, openPaths, activePath: nextActive } : gr)));
      }
      const stillOpenElsewhere = snapshot.some((gr) => gr.id !== groupId && gr.openPaths.includes(filePath));
      if (!stillOpenElsewhere) cleanupClosedPaths([filePath]);
    },
    [cleanupClosedPaths],
  );

  const closeAllTabs = useCallback(
    (groupId: string) => {
      const snapshot = groupsRef.current;
      const idx = snapshot.findIndex((g) => g.id === groupId);
      if (idx === -1) return;
      const g = snapshot[idx];
      const remainingElsewhere = new Set(snapshot.filter((gr) => gr.id !== groupId).flatMap((gr) => gr.openPaths));
      const toCleanup = g.openPaths.filter((p) => !remainingElsewhere.has(p));
      if (snapshot.length > 1) {
        const nextGroups = snapshot.filter((_, i) => i !== idx);
        setGroups(nextGroups);
        if (activeGroupIdRef.current === groupId) {
          setActiveGroupId((nextGroups[idx] ?? nextGroups[idx - 1] ?? nextGroups[0]).id);
        }
      } else {
        setGroups(snapshot.map((gr, i) => (i === idx ? { ...gr, openPaths: [], activePath: null } : gr)));
      }
      cleanupClosedPaths(toCleanup);
    },
    [cleanupClosedPaths],
  );

  // Collapses every split group back down to one empty pane (Open Editors "Close All").
  const closeAllTabsEverywhere = useCallback(() => {
    const snapshot = groupsRef.current;
    const allPaths = snapshot.flatMap((g) => g.openPaths);
    const keepId = activeGroupIdRef.current;
    setGroups([{ id: keepId, openPaths: [], activePath: null }]);
    cleanupClosedPaths(allPaths);
  }, [cleanupClosedPaths]);

  const splitGroup = useCallback(() => {
    const snapshot = groupsRef.current;
    const sourceIdx = snapshot.findIndex((g) => g.id === activeGroupIdRef.current);
    const source = snapshot[sourceIdx] ?? snapshot[0];
    if (!source || !source.activePath) return;
    const id = newGroupId();
    // A browser tab is backed by a single native webview that can only be
    // attached to one pane's bounds at a time — mirroring it into both panes
    // would leave the two panes fighting over where it's positioned. Splitting
    // one opens a fresh blank pane instead of duplicating it.
    const activePath = isBrowserPath(source.activePath) ? browserPath(blankBrowserUrl()) : source.activePath;
    const group: EditorGroup = { id, openPaths: [activePath], activePath };
    const at = sourceIdx === -1 ? snapshot.length : sourceIdx + 1;
    setGroups([...snapshot.slice(0, at), group, ...snapshot.slice(at)]);
    setActiveGroupId(id);
  }, [newGroupId]);

  // Dragging a tab past a pane's left/right edge moves it into a brand new
  // group inserted on that side, instead of just reordering within the strip.
  const moveTabToNewSplit = useCallback(
    (filePath: string, targetGroupId: string, side: "left" | "right") => {
      const snapshot = groupsRef.current;
      const sourceIdx = snapshot.findIndex((g) => g.openPaths.includes(filePath));
      if (sourceIdx === -1) return;
      const source = snapshot[sourceIdx];
      // Dragging a group's only tab to its own edge would just recreate the same layout.
      if (source.id === targetGroupId && source.openPaths.length === 1) return;

      const id = newGroupId();
      const newGroup: EditorGroup = { id, openPaths: [filePath], activePath: filePath };

      let next = snapshot.map((g, i) => {
        if (i !== sourceIdx) return g;
        const openPaths = g.openPaths.filter((p) => p !== filePath);
        let activePath = g.activePath;
        if (activePath === filePath) {
          const oldIdx = g.openPaths.indexOf(filePath);
          activePath = openPaths[oldIdx] ?? openPaths[oldIdx - 1] ?? openPaths[openPaths.length - 1] ?? null;
        }
        return { ...g, openPaths, activePath };
      });
      if (next[sourceIdx].openPaths.length === 0) next = next.filter((_, i) => i !== sourceIdx);

      const targetIdx = next.findIndex((g) => g.id === targetGroupId);
      const insertAt = targetIdx === -1 ? next.length : side === "left" ? targetIdx : targetIdx + 1;
      next = [...next.slice(0, insertAt), newGroup, ...next.slice(insertAt)];

      setGroups(next);
      setActiveGroupId(id);
    },
    [newGroupId],
  );

  // Moves a tab into an EXISTING group (no new pane created) — used by the
  // Open Editors panel's cross-group drag, and by dropping onto a pane.
  const moveTabToGroup = useCallback((filePath: string, targetGroupId: string) => {
    const snapshot = groupsRef.current;
    const sourceIdx = snapshot.findIndex((g) => g.openPaths.includes(filePath));
    if (sourceIdx === -1) return;
    const source = snapshot[sourceIdx];
    if (source.id === targetGroupId) {
      // Already there — just focus it.
      setActiveGroupId(targetGroupId);
      setGroups((prev) => prev.map((g) => (g.id === targetGroupId ? { ...g, activePath: filePath } : g)));
      return;
    }
    if (!snapshot.some((g) => g.id === targetGroupId)) return;

    let next = snapshot.map((g, i) => {
      if (i !== sourceIdx) return g;
      const openPaths = g.openPaths.filter((p) => p !== filePath);
      let activePath = g.activePath;
      if (activePath === filePath) {
        const oldIdx = g.openPaths.indexOf(filePath);
        activePath = openPaths[oldIdx] ?? openPaths[oldIdx - 1] ?? openPaths[openPaths.length - 1] ?? null;
      }
      return { ...g, openPaths, activePath };
    });
    if (next[sourceIdx].openPaths.length === 0 && next.length > 1) next = next.filter((_, i) => i !== sourceIdx);

    next = next.map((g) =>
      g.id === targetGroupId
        ? { ...g, activePath: filePath, openPaths: g.openPaths.includes(filePath) ? g.openPaths : [...g.openPaths, filePath] }
        : g,
    );

    setGroups(next);
    setActiveGroupId(targetGroupId);
  }, []);

  const handleTabDragStart = useCallback(() => setDropZone(null), []);

  const handleTabDrag = useCallback((path: string, point: { x: number; y: number }) => {
    const paneEl = (document.elementFromPoint(point.x, point.y) as HTMLElement | null)?.closest(
      "[data-group-pane]",
    ) as HTMLElement | null;
    if (!paneEl) {
      setDropZone(null);
      return;
    }
    const groupId = paneEl.dataset.groupPane!;
    const rect = paneEl.getBoundingClientRect();
    const frac = (point.x - rect.left) / rect.width;
    if (frac < 0.2) setDropZone({ groupId, side: "left" });
    else if (frac > 0.8) setDropZone({ groupId, side: "right" });
    else {
      // Hovering the middle of a DIFFERENT group than the tab's own means
      // "join that group" rather than "split it".
      const owner = groupsRef.current.find((g) => g.openPaths.includes(path));
      if (owner && owner.id !== groupId) setDropZone({ groupId, side: "move" });
      else setDropZone(null);
    }
  }, []);

  const handleTabDragEnd = useCallback(
    (filePath: string) => {
      const zone = dropZoneRef.current;
      setDropZone(null);
      if (!zone) return;
      if (zone.side === "move") moveTabToGroup(filePath, zone.groupId);
      else moveTabToNewSplit(filePath, zone.groupId, zone.side);
    },
    [moveTabToNewSplit, moveTabToGroup],
  );

  // Native browser views belong to the window rather than to React, so they
  // have to be torn down explicitly when the workspace goes away.
  useEffect(
    () => () => {
      groupsRef.current.flatMap((g) => g.openPaths).filter(isBrowserPath).forEach(destroyBrowserView);
    },
    [],
  );

  const openBrowser = useCallback((url?: string, opts?: { groupId?: string }) => {
    // No address means a blank pane, and each blank pane is its own tab.
    const target = browserPath(url ? normalizeUrl(url) : blankBrowserUrl());
    const groupId = opts?.groupId ?? activeGroupIdRef.current;
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, activePath: target, openPaths: g.openPaths.includes(target) ? g.openPaths : [...g.openPaths, target] } : g,
      ),
    );
    setActiveGroupId(groupId);
  }, []);

  const handleOpenDiff = useCallback(
    async (filePath: string) => {
      const diffPath = DIFF_PREFIX + filePath;
      const groupId = activeGroupIdRef.current;
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId ? { ...g, activePath: diffPath, openPaths: g.openPaths.includes(diffPath) ? g.openPaths : [...g.openPaths, diffPath] } : g,
        ),
      );
      setActiveGroupId(groupId);
      if (diffBuffers[diffPath]) return;
      try {
        const absolutePath = joinPath(path, filePath);
        const [original, modified] = await Promise.all([
          gitShow(path, filePath),
          readFileText(absolutePath).catch(() => ""),
        ]);
        setDiffBuffers((prev) => ({ ...prev, [diffPath]: { original, modified } }));
      } catch {
        setDiffBuffers((prev) => ({
          ...prev,
          [diffPath]: { original: "", modified: "" },
        }));
      }
    },
    [path, diffBuffers],
  );

  const handleChange = useCallback((filePath: string, value: string) => {
    setBuffers((prev) => {
      const buf = prev[filePath];
      if (!buf) return prev;
      return { ...prev, [filePath]: { ...buf, value } };
    });
  }, []);

  const saveFile = useCallback(
    async (filePath: string | null) => {
      if (!filePath) return;
      const buf = buffers[filePath];
      if (!buf || buf.error || buf.value === buf.saved) return;
      try {
        await writeFileText(filePath, buf.value);
        setBuffers((prev) => {
          const current = prev[filePath];
          return current ? { ...prev, [filePath]: { ...current, saved: current.value } } : prev;
        });
      } catch (err) {
        notify(`Couldn't save ${baseName(filePath)}: ${String(err)}`);
      }
    },
    [buffers, notify],
  );

  const saveAll = useCallback(() => {
    const all = new Set(groupsRef.current.flatMap((g) => g.openPaths));
    for (const p of all) void saveFile(p);
  }, [saveFile]);

  // Rewrite open tabs when a file/folder is renamed or deleted on disk.
  const remapPaths = useCallback((from: string, to: string | null) => {
    const affected = (p: string) => p === from || p.startsWith(from + "/") || p.startsWith(from + "\\");
    const prev = groupsRef.current;
    let next = prev.map((g) => {
      const openPaths = g.openPaths.flatMap((p) => (!affected(p) ? [p] : to ? [to + p.slice(from.length)] : []));
      let activePath = g.activePath;
      if (activePath && affected(activePath)) {
        if (to) {
          activePath = to + activePath.slice(from.length);
        } else {
          // Deleted: fall back to a surviving neighbour instead of clearing the editor.
          const idx = g.openPaths.indexOf(activePath);
          activePath = openPaths[idx] ?? openPaths[idx - 1] ?? openPaths[openPaths.length - 1] ?? null;
        }
      }
      return { ...g, openPaths, activePath };
    });
    if (next.length > 1) {
      const survivors = next.filter((g) => g.openPaths.length > 0);
      if (survivors.length > 0) next = survivors;
    }
    setGroups(next);
    if (!next.some((g) => g.id === activeGroupIdRef.current)) setActiveGroupId(next[0].id);
    setBuffers((prevBuf) => {
      const nextBuf: Record<string, FileBuffer> = {};
      for (const [p, buf] of Object.entries(prevBuf)) {
        if (!affected(p)) nextBuf[p] = buf;
        else if (to) nextBuf[to + p.slice(from.length)] = buf;
      }
      return nextBuf;
    });
  }, []);

  // ---- explorer actions --------------------------------------------------
  const refreshTree = useCallback(() => setRefreshNonce((n) => n + 1), []);
  const toggleExpand = useCallback((p: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);
  const collapseAll = useCallback(() => setExpanded(new Set()), []);
  const expandPaths = useCallback((paths: string[]) => {
    setExpanded((prev) => {
      if (paths.every((p) => prev.has(p))) return prev;
      const next = new Set(prev);
      for (const p of paths) next.add(p);
      return next;
    });
  }, []);

  // ---- inline create / rename / delete / move (no modals) ----------------
  const beginCreate = useCallback(
    (parentDir: string, isDir: boolean) => {
      setExpanded((prev) => new Set(prev).add(parentDir)); // reveal where the new entry will land
      setActiveView("explorer");
      if (!sidebarVisible) setSetting("sidebarVisible", true);
      setCreating({ parentPath: parentDir, isDir });
    },
    [sidebarVisible],
  );

  const cancelCreate = useCallback(() => setCreating(null), []);

  const commitCreate = useCallback(
    async (name: string) => {
      const current = creating;
      if (!current) return;
      const target = joinPath(current.parentPath, name);
      try {
        await createEntry(target, current.isDir);
        history.record({ kind: "create", to: target, isDir: current.isDir });
        setCreating(null);
        refreshTree();
        reloadIndex();
        if (!current.isDir) void openFile(target);
      } catch (err) {
        notify(String(err)); // keep `creating` open so the user can correct the name
      }
    },
    [creating, openFile, refreshTree, reloadIndex, notify, history],
  );

  const beginRename = useCallback((targetPath: string) => setRenamingPath(targetPath), []);
  const cancelRename = useCallback(() => setRenamingPath(null), []);

  const commitRename = useCallback(
    async (newName: string) => {
      const targetPath = renamingPath;
      if (!targetPath) return;
      const to = joinPath(dirName(targetPath), newName);
      if (to === targetPath) {
        setRenamingPath(null);
        return;
      }
      try {
        await renameEntry(targetPath, to);
        history.record({ kind: "move", from: targetPath, to });
        setRenamingPath(null);
        remapPaths(targetPath, to);
        refreshTree();
        reloadIndex();
      } catch (err) {
        notify(String(err)); // keep `renamingPath` open so the user can correct the name
      }
    },
    [renamingPath, remapPaths, refreshTree, reloadIndex, notify, history],
  );

  const beginDelete = useCallback((targetPath: string, isDir: boolean) => setDeletingPath({ path: targetPath, isDir }), []);
  const cancelDelete = useCallback(() => setDeletingPath(null), []);

  const confirmDelete = useCallback(async () => {
    const target = deletingPath;
    if (!target) return;
    try {
      // Captured before the delete so undo can put a single file back; folders
      // and unreadable files are recorded as permanent.
      const content = target.isDir ? null : await readFileText(target.path).catch(() => null);
      // Only touch tabs/buffers after the disk delete actually succeeds,
      // so a failed delete never discards unsaved work.
      await deleteEntry(target.path);
      history.record({ kind: "delete", to: target.path, isDir: target.isDir, content });
      setDeletingPath(null);
      remapPaths(target.path, null);
      refreshTree();
      reloadIndex();
    } catch (err) {
      notify(String(err));
      setDeletingPath(null);
    }
  }, [deletingPath, remapPaths, refreshTree, reloadIndex, notify, history]);

  const moveEntry = useCallback(
    async (sourcePath: string, targetDir: string) => {
      if (targetDir === sourcePath || targetDir.startsWith(sourcePath + "/") || targetDir.startsWith(sourcePath + "\\")) {
        return; // can't move a folder into itself or one of its own descendants
      }
      if (targetDir === dirName(sourcePath)) return; // already there
      const to = joinPath(targetDir, baseName(sourcePath));
      try {
        await renameEntry(sourcePath, to);
        history.record({ kind: "move", from: sourcePath, to });
        remapPaths(sourcePath, to);
        setExpanded((prev) => new Set(prev).add(targetDir));
        refreshTree();
        reloadIndex();
      } catch (err) {
        notify(String(err));
      }
    },
    [remapPaths, refreshTree, reloadIndex, notify, history],
  );

  const undoFileOperation = useCallback(async () => {
    try {
      const op = await history.undo();
      if (!op) return;
      if (op.kind === "move") remapPaths(op.to, op.from);
      else if (op.kind === "create" || op.kind === "copy") remapPaths(op.to, null);
      refreshTree();
      reloadIndex();
    } catch (err) {
      notify(String(err));
    }
  }, [history, remapPaths, refreshTree, reloadIndex, notify]);

  const redoFileOperation = useCallback(async () => {
    try {
      const op = await history.redo();
      if (!op) return;
      if (op.kind === "move") remapPaths(op.from, op.to);
      else if (op.kind === "delete") remapPaths(op.to, null);
      refreshTree();
      reloadIndex();
    } catch (err) {
      notify(String(err));
    }
  }, [history, remapPaths, refreshTree, reloadIndex, notify]);

  const openSearchInFolder = useCallback((scopePath: string) => {
    setSearchScope(scopePath);
    setActiveView("search");
    setSetting("sidebarVisible", true);
  }, []);

  const treeActions: TreeActions = useMemo(
    () => ({
      activePath,
      onOpenFile: openFile,
      creating,
      onBeginCreate: beginCreate,
      onCommitCreate: commitCreate,
      onCancelCreate: cancelCreate,
      renamingPath,
      onBeginRename: beginRename,
      onCommitRename: commitRename,
      onCancelRename: cancelRename,
      deletingPath: deletingPath?.path ?? null,
      onBeginDelete: beginDelete,
      onConfirmDelete: confirmDelete,
      onCancelDelete: cancelDelete,
      onMoveEntry: moveEntry,
      onRecord: history.record,
      onUndo: undoFileOperation,
      onRedo: redoFileOperation,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
    }),
    [
      activePath,
      openFile,
      creating,
      beginCreate,
      commitCreate,
      cancelCreate,
      renamingPath,
      beginRename,
      commitRename,
      cancelRename,
      deletingPath,
      beginDelete,
      confirmDelete,
      cancelDelete,
      moveEntry,
      history.record,
      history.canUndo,
      history.canRedo,
      undoFileOperation,
      redoFileOperation,
    ],
  );

  // ---- view / palette helpers -------------------------------------------
  const openPalette = useCallback((mode: PaletteMode) => setPalette({ open: true, mode }), []);
  const toggleSidebar = useCallback(() => setSetting("sidebarVisible", !sidebarVisible), [sidebarVisible]);
  const toggleTerminal = useCallback(() => setSetting("terminalVisible", !terminalVisible), [terminalVisible]);

  // Drag the handle above the terminal panel to resize it.
  const terminalDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const onTerminalDragStart = useCallback(
    (e: React.MouseEvent) => {
      terminalDragRef.current = { startY: e.clientY, startHeight: terminalHeight };
      const onMove = (ev: MouseEvent) => {
        const drag = terminalDragRef.current;
        if (!drag) return;
        const next = drag.startHeight - (ev.clientY - drag.startY);
        setTerminalHeight(Math.min(600, Math.max(120, next)));
      };
      const onUp = () => {
        terminalDragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [terminalHeight],
  );

  // Drag the handle at the sidebar's right edge to resize it.
  const sidebarDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const onSidebarDragStart = useCallback(
    (e: React.MouseEvent) => {
      sidebarDragRef.current = { startX: e.clientX, startWidth: sidebarWidth };
      const onMove = (ev: MouseEvent) => {
        const drag = sidebarDragRef.current;
        if (!drag) return;
        const next = drag.startWidth + (ev.clientX - drag.startX);
        setSetting("sidebarWidth", Math.min(480, Math.max(180, next)));
      };
      const onUp = () => {
        sidebarDragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [sidebarWidth],
  );

  // Split panes size themselves with flex-grow ratios (default 1 = equal
  // split) rather than fixed pixel widths, so adding/removing a group doesn't
  // require recomputing everyone else's width.
  const [groupFlex, setGroupFlex] = useState<Record<string, number>>({});
  const groupFlexRef = useRef(groupFlex);
  groupFlexRef.current = groupFlex;
  const groupsRowRef = useRef<HTMLDivElement>(null);
  const MIN_GROUP_FLEX = 0.15;

  const onGroupDividerDragStart = useCallback((e: React.MouseEvent, leftId: string, rightId: string) => {
    e.preventDefault();
    const row = groupsRowRef.current;
    const leftEl = row?.querySelector(`[data-group-pane="${leftId}"]`) as HTMLElement | null;
    const rightEl = row?.querySelector(`[data-group-pane="${rightId}"]`) as HTMLElement | null;
    if (!leftEl || !rightEl) return;
    const startX = e.clientX;
    const leftStartWidth = leftEl.getBoundingClientRect().width;
    const rightStartWidth = rightEl.getBoundingClientRect().width;
    const leftStartFlex = groupFlexRef.current[leftId] ?? 1;
    const rightStartFlex = groupFlexRef.current[rightId] ?? 1;
    const pxPerFlex = (leftStartWidth + rightStartWidth) / (leftStartFlex + rightStartFlex);
    if (!Number.isFinite(pxPerFlex) || pxPerFlex <= 0) return;

    const onMove = (ev: MouseEvent) => {
      const dFlex = (ev.clientX - startX) / pxPerFlex;
      const nextLeft = Math.max(MIN_GROUP_FLEX, leftStartFlex + dFlex);
      const nextRight = Math.max(MIN_GROUP_FLEX, rightStartFlex - dFlex);
      setGroupFlex((prev) => ({ ...prev, [leftId]: nextLeft, [rightId]: nextRight }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const selectView = useCallback(
    (v: ViewId) => {
      if (v === activeView && sidebarVisible) {
        setSetting("sidebarVisible", false);
        return;
      }
      setActiveView(v);
      if (!sidebarVisible) setSetting("sidebarVisible", true);
    },
    [activeView, sidebarVisible],
  );

  // The explorer reports the folder its selection sits in, so the toolbar's
  // New File/New Folder land next to what the user is looking at.
  const explorerTarget = useRef(path);
  useEffect(() => {
    explorerTarget.current = path;
  }, [path]);
  const trackExplorerTarget = useCallback((dir: string) => {
    explorerTarget.current = dir;
  }, []);

  const requestNewFile = useCallback(() => beginCreate(explorerTarget.current, false), [beginCreate]);
  const requestNewFolder = useCallback(() => beginCreate(explorerTarget.current, true), [beginCreate]);
  const openFilesPalette = useCallback(() => openPalette("files"), [openPalette]);

  const cycleIconTheme = useCallback(() => {
    const idx = iconThemes.findIndex((t) => t.id === iconTheme);
    const next = iconThemes[(idx + 1) % iconThemes.length];
    setSetting("iconTheme", next.id);
  }, [iconTheme]);

  // ---- commands ----------------------------------------------------------
  const commands: Command[] = useMemo(() => {
    const list: Command[] = [
      { id: "file.newFile", title: "New File", category: "File", icon: NewFileIcon, keywords: "create", run: requestNewFile },
      { id: "file.newFolder", title: "New Folder", category: "File", icon: NewFolderIcon, keywords: "create directory", run: requestNewFolder },
      { id: "file.save", title: "Save", category: "File", shortcut: "Ctrl+S", enabled: !!activePath, run: () => saveFile(activePath) },
      { id: "file.saveAll", title: "Save All", category: "File", enabled: groups.some((g) => g.openPaths.length > 0), run: saveAll },
      { id: "file.closeEditor", title: "Close Editor", category: "File", shortcut: "Ctrl+W", enabled: !!activePath, run: () => activePath && closeTab(activePath, activeGroupId) },
      { id: "file.closeFolder", title: "Close Folder", category: "File", run: onClose },
      { id: "view.quickOpen", title: "Go to File…", category: "Go", icon: GoToFileIcon, shortcut: "Ctrl+P", run: () => openPalette("files") },
      { id: "view.toggleSidebar", title: "Toggle Sidebar", category: "View", icon: SidebarIcon, shortcut: "Ctrl+B", run: toggleSidebar },
      { id: "view.toggleTerminal", title: "Toggle Terminal", category: "View", icon: TerminalIcon, shortcut: "Ctrl+`", run: toggleTerminal },
      { id: "view.splitEditor", title: "Split Editor Right", category: "View", icon: SplitIcon, shortcut: "Ctrl+\\", enabled: !!activePath, run: splitGroup },
      { id: "view.explorer", title: "Show Explorer", category: "View", icon: FilesIcon, run: () => selectView("explorer") },
      { id: "view.search", title: "Show Search", category: "View", icon: SearchIcon, run: () => selectView("search") },
      { id: "view.scm", title: "Show Source Control", category: "View", icon: ScmIcon, run: () => selectView("scm") },
      { id: "view.extensions", title: "Show Extensions", category: "View", icon: ExtensionsIcon, run: () => selectView("extensions") },
      { id: "view.settings", title: "Open Settings", category: "View", icon: SettingsIcon, shortcut: "Ctrl+,", run: () => openSettings() },
      { id: "view.browser", title: "Browser: Open Simple Browser", category: "View", icon: BrowserIcon, keywords: "web preview localhost url", run: () => openBrowser() },
      { id: "explorer.refresh", title: "Refresh Explorer", category: "View", icon: RefreshIcon, run: refreshTree },
      { id: "explorer.collapse", title: "Collapse Folders in Explorer", category: "View", icon: CollapseAllIcon, run: collapseAll },
    ];
    for (const t of iconThemes) {
      list.push({
        id: `pref.iconTheme.${t.id}`,
        title: `File Icon Theme: ${t.label}`,
        category: "Preferences",
        icon: SettingsIcon,
        keywords: "icons appearance",
        enabled: t.id !== iconTheme,
        run: () => setSetting("iconTheme", t.id),
      });
    }
    return list;
  }, [activePath, activeGroupId, groups, saveFile, saveAll, closeTab, splitGroup, onClose, openPalette, toggleSidebar, toggleTerminal, selectView, refreshTree, collapseAll, iconTheme, requestNewFile, requestNewFolder, openSettings, openBrowser]);

  // ---- global keybindings ------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The palette, AI settings, and any inline tree edit own the keyboard while active.
      if (palette.open || creating || renamingPath || deletingPath) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (e.shiftKey && k === "p") {
        e.preventDefault();
        openPalette("commands");
      } else if (k === "p") {
        e.preventDefault();
        openPalette("files");
      } else if (k === "s") {
        e.preventDefault();
        void saveFile(activePath);
      } else if (k === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (k === "`") {
        e.preventDefault();
        toggleTerminal();
      } else if (k === "w" && activePath) {
        e.preventDefault();
        closeTab(activePath, activeGroupId);
      } else if (k === "\\") {
        e.preventDefault();
        splitGroup();
      } else if (k === ",") {
        e.preventDefault();
        openSettings();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePath, activeGroupId, openPalette, saveFile, toggleSidebar, toggleTerminal, closeTab, splitGroup, openSettings, palette.open, creating, renamingPath, deletingPath]);

  // Tab-row data is memoized per group so an unrelated group's re-render
  // doesn't reshuffle a group whose tabs/dirty-state didn't actually change.
  const tabsCacheRef = useRef(new Map<string, OpenTab[]>());
  const buildTabs = useCallback(
    (groupId: string, openPaths: string[]): OpenTab[] => {
      const next = openPaths.map((p) => ({
        path: p,
        dirty: isDiffPath(p) || isBrowserPath(p) ? false : buffers[p] ? buffers[p].value !== buffers[p].saved : false,
        label: isBrowserPath(p)
          ? browserTitles[p] || browserLabel(browserUrls[p] ?? urlFromBrowserPath(p))
          : undefined,
        icon: isBrowserPath(p) ? browserIcons[p] : undefined,
      }));
      const prev = tabsCacheRef.current.get(groupId) ?? [];
      const same =
        prev.length === next.length &&
        prev.every(
          (t, i) =>
            t.path === next[i].path && t.dirty === next[i].dirty && t.label === next[i].label && t.icon === next[i].icon,
        );
      const result = same ? prev : next;
      tabsCacheRef.current.set(groupId, result);
      return result;
    },
    [buffers, browserUrls, browserIcons, browserTitles],
  );
  for (const id of tabsCacheRef.current.keys()) {
    if (!groups.some((g) => g.id === id)) tabsCacheRef.current.delete(id);
  }

  // The "Open Editors" panel shows one section per group.
  const openEditorsGroups = useMemo(
    () => groups.map((g) => ({ id: g.id, tabs: buildTabs(g.id, g.openPaths) })),
    [groups, buildTabs],
  );

  const selectInGroup = useCallback((p: string, groupId: string) => {
    setActiveGroupId(groupId);
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, activePath: p } : g)));
  }, []);

  const isBrowserTab = !!activePath && isBrowserPath(activePath);
  const activeBuffer = activePath && !isBrowserTab ? buffers[activePath] : undefined;

  const openEditorsPanel: OpenEditorsProps | undefined = showOpenEditors
    ? {
        groups: openEditorsGroups,
        activeGroupId,
        activePath,
        expanded: openEditorsExpanded,
        onToggleExpanded: () => setSetting("explorerOpenEditorsExpanded", !openEditorsExpanded),
        onSelect: selectInGroup,
        onClose: closeTab,
        onCloseAll: closeAllTabsEverywhere,
        onMoveToGroup: moveTabToGroup,
      }
    : undefined;

  // Renders one split pane: its tab strip, breadcrumbs/markdown toggle, drop
  // overlay, and whichever viewer its active tab needs. A plain render-time
  // function (not a component) so it shares Workspace's closures without prop drilling.
  function renderGroupPane(group: EditorGroup) {
    const gActive = group.activePath;
    const gTabs = buildTabs(group.id, group.openPaths);
    const gIsBrowser = !!gActive && isBrowserPath(gActive);
    const gBrowserVisible = gIsBrowser && !settingsOpen && !palette.open && !notice;
    const gBuffer = gActive && !gIsBrowser ? buffers[gActive] : undefined;
    const gDiffData = gActive && isDiffPath(gActive) ? diffBuffers[gActive] : undefined;
    const gRel = gActive && !isDiffPath(gActive) && !gIsBrowser ? relativeTo(path, gActive) : null;
    const isFocused = group.id === activeGroupId;
    const zone = dropZone?.groupId === group.id ? dropZone.side : null;

    return (
      <div
        data-group-pane={group.id}
        onMouseDownCapture={() => {
          if (!isFocused) setActiveGroupId(group.id);
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(TAB_DND_TYPE)) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          const p = e.dataTransfer.getData(TAB_DND_TYPE);
          if (p) moveTabToGroup(p, group.id);
        }}
        style={{ flexGrow: groupFlex[group.id] ?? 1, flexBasis: 0 }}
        className="relative flex min-w-0 flex-col"
      >
        {zone === "move" ? (
          <div className="pointer-events-none absolute inset-2 z-20 rounded-lg border-2 border-dashed border-accent/70 bg-accent/10" />
        ) : (
          zone && (
            <div
              className={`pointer-events-none absolute inset-y-0 z-20 w-1/2 border-2 border-accent/70 bg-accent/15 ${
                zone === "left" ? "left-0" : "right-0"
              }`}
            />
          )
        )}
        {group.openPaths.length > 0 && (
          <EditorTabs
            tabs={gTabs}
            activePath={gActive}
            onSelect={(p) => setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, activePath: p } : g)))}
            onClose={(p) => closeTab(p, group.id)}
            onReorder={(newTabs) =>
              setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, openPaths: newTabs.map((t) => t.path) } : g)))
            }
            onSplit={splitGroup}
            onCloseGroup={groups.length > 1 ? () => closeAllTabs(group.id) : undefined}
            onTabDragStart={handleTabDragStart}
            onTabDrag={handleTabDrag}
            onTabDragEnd={handleTabDragEnd}
          />
        )}
        {gActive && !gIsBrowser && !isDiffPath(gActive) && !isImagePath(gActive) && !isDrawioPath(gActive) && !isPdfPath(gActive) && !gBuffer?.error && (
          <div className="flex items-center justify-between border-b border-white/[0.05] px-4">
            <Breadcrumbs relPath={gRel} />
            {isMarkdownPath(gActive) && (
              <div
                role="radiogroup"
                aria-label="Markdown view mode"
                className="flex shrink-0 items-center gap-0.5 rounded-md bg-white/[0.03] p-0.5"
              >
                {MARKDOWN_VIEWS.map((view) => {
                  const active = (markdownPreviewMode[gActive] ?? "preview") === view.id;
                  return (
                    <button
                      key={view.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      title={view.title}
                      onClick={() => setMarkdownPreviewMode((prev) => ({ ...prev, [gActive]: view.id }))}
                      className={`focus-ring rounded px-2.5 py-1 text-xs transition-colors ${
                        active ? "bg-white/[0.08] text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {view.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1">
          {gActive && gIsBrowser ? (
            <Suspense fallback={<div className="h-full w-full bg-canvas" />}>
              <BrowserView
                viewKey={gActive}
                url={browserUrls[gActive] ?? urlFromBrowserPath(gActive)}
                visible={gBrowserVisible}
                onUrlChange={(url) =>
                  setBrowserUrls((prev) => (prev[gActive] === url ? prev : { ...prev, [gActive]: url }))
                }
                onMetaChange={(meta) => {
                  setBrowserIcons((prev) => (prev[gActive] === meta.icon ? prev : { ...prev, [gActive]: meta.icon }));
                  setBrowserTitles((prev) => (prev[gActive] === meta.title ? prev : { ...prev, [gActive]: meta.title }));
                }}
              />
            </Suspense>
          ) : gActive && isDiffPath(gActive) ? (
            gDiffData ? (
              <Suspense fallback={<div className="h-full w-full bg-canvas" />}>
                <MonacoDiffEditor original={gDiffData.original} modified={gDiffData.modified} filePath={realPathFromDiff(gActive)} />
              </Suspense>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">Loading diff…</div>
            )
          ) : gActive && isImagePath(gActive) ? (
            <Suspense fallback={<div className="h-full w-full bg-canvas" />}>
              <ImageViewer path={gActive} />
            </Suspense>
          ) : gActive && isDrawioPath(gActive) ? (
            <Suspense fallback={<div className="h-full w-full bg-canvas" />}>
              <DrawioEditor path={gActive} />
            </Suspense>
          ) : gActive && isPdfPath(gActive) ? (
            <Suspense fallback={<div className="h-full w-full bg-canvas" />}>
              <PdfViewer path={gActive} />
            </Suspense>
          ) : gActive && gBuffer ? (
            gBuffer.error ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm text-zinc-400">Can’t open {baseName(gActive)}</p>
                <p className="max-w-md text-xs text-zinc-400">{gBuffer.error}</p>
              </div>
            ) : isMarkdownPath(gActive) && markdownPreviewMode[gActive] === "rich" ? (
              <Suspense fallback={<div className="h-full w-full bg-canvas" />}>
                <RichTextEditor
                  path={gActive}
                  content={gBuffer.value}
                  onChange={(v) => handleChange(gActive, v)}
                  onSave={() => saveFile(gActive)}
                />
              </Suspense>
            ) : isMarkdownPath(gActive) && markdownPreviewMode[gActive] !== "markdown" ? (
              <Suspense fallback={<div className="h-full w-full bg-canvas" />}>
                <MarkdownPreview path={gActive} content={gBuffer.value} />
              </Suspense>
            ) : (
              <Suspense fallback={<div className="h-full w-full bg-canvas" />}>
                <CodeEditor
                  path={gActive}
                  value={gBuffer.value}
                  onChange={(v) => handleChange(gActive, v)}
                  onSave={() => saveFile(gActive)}
                  onCursor={isFocused ? setCursor : undefined}
                  openPaths={group.openPaths}
                />
              </Suspense>
            )
          ) : (
            <EmptyEditor onOpenFile={() => openPalette("files")} onOpenCommands={() => openPalette("commands")} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-canvas text-zinc-200">
      <div className="flex min-h-0 flex-1">
        {sidebarVisible && (
          <>
            <Sidebar
              view={activeView}
              rootPath={path}
              folderLabel={folderName(path)}
              width={sidebarWidth}
              actions={treeActions}
              expanded={expanded}
              onToggle={toggleExpand}
              onExpandPaths={expandPaths}
              refreshNonce={refreshNonce}
              onNewFile={requestNewFile}
              onNewFolder={requestNewFolder}
              onRefresh={refreshTree}
              onCollapseAll={collapseAll}
              onOpenBrowser={() => openBrowser()}
              onOpenInBrowser={(p) => openBrowser(fileUrl(p))}
              onOpenPalette={openFilesPalette}
              onSelectView={selectView}
              onOpenSettings={openSettings}
              onChangeWorkspace={handleChangeWorkspace}
              onGoHome={onClose}
              onOpenDiff={handleOpenDiff}
              onOpenSearch={openSearchInFolder}
              onTargetDirChange={trackExplorerTarget}
              onError={notify}
              searchScope={searchScope}
              openEditors={openEditorsPanel}
            />
            <div onMouseDown={onSidebarDragStart} className="w-1 shrink-0 cursor-col-resize hover:bg-white/[0.08]" />
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={groupsRowRef} className="flex min-h-0 flex-1">
            {groups.map((group, i) => (
              <Fragment key={group.id}>
                {i > 0 && (
                  <div
                    onMouseDown={(e) => onGroupDividerDragStart(e, groups[i - 1].id, group.id)}
                    role="separator"
                    aria-orientation="vertical"
                    className="w-1 shrink-0 cursor-col-resize hover:bg-white/[0.08]"
                  />
                )}
                {renderGroupPane(group)}
              </Fragment>
            ))}
          </div>

          {terminalMounted && (
            <div
              className={
                terminalVisible
                  ? "flex shrink-0 flex-col border-t border-white/[0.05] bg-canvas"
                  : "hidden"
              }
              style={terminalVisible ? { height: terminalHeight } : undefined}
            >
              <div onMouseDown={onTerminalDragStart} className="h-1 shrink-0 cursor-row-resize hover:bg-white/[0.08]" />
              <div className="min-h-0 flex-1">
                <Suspense fallback={<div className="h-full w-full bg-canvas" />}>
                  <TerminalPanel rootPath={path} visible={terminalVisible} onOpenUrl={openBrowser} />
                </Suspense>
              </div>
            </div>
          )}
        </div>
      </div>

      <SettingsPanel
        open={settingsOpen}
        section={settingsSection}
        onSelectSection={setSettingsSection}
        onClose={closeSettings}
      />

      <StatusBar
        cursor={activePath && !isBrowserTab && !activeBuffer?.error ? cursor : null}
        language={activePath && !isBrowserTab ? languageLabelForPath(activePath) : null}
        iconThemeLabel={getIconTheme(iconTheme).label}
        onPickIconTheme={cycleIconTheme}
      />

      <CommandPalette
        open={palette.open}
        mode={palette.mode}
        files={files}
        commands={commands}
        onClose={() => setPalette((p) => ({ ...p, open: false }))}
        onOpenFile={openFile}
      />

      <Toast message={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}

function Toast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="fixed bottom-9 right-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-white/10 bg-abyss px-4 py-3 shadow-2xl shadow-black/60"
        >
          <span className="mt-0.5 text-red-400">
            <ErrorIcon size={16} />
          </span>
          <p className="text-xs leading-relaxed text-zinc-300">{message}</p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="ml-1 shrink-0 text-zinc-500 transition-colors hover:text-zinc-200"
          >
            <CloseGlyph size={12} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function EmptyEditor({ onOpenFile, onOpenCommands }: { onOpenFile: () => void; onOpenCommands: () => void }) {
  const hints: { keys: string[]; label: string; onClick?: () => void }[] = [
    { keys: ["Ctrl", "P"], label: "Go to file", onClick: onOpenFile },
    { keys: ["Ctrl", "Shift", "P"], label: "Show all commands", onClick: onOpenCommands },
    { keys: ["Ctrl", "B"], label: "Toggle sidebar" },
    { keys: ["Ctrl", "S"], label: "Save file" },
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="relative"
      >
        <img src="/logo.svg" alt="" className="relative h-16 w-16 select-none object-contain opacity-90 brightness-0 invert" />
      </motion.div>

      <div className="w-full max-w-xs space-y-1.5">
        {hints.map((h, i) => (
          <motion.div
            key={h.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.06, duration: 0.3 }}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
              h.onClick ? "cursor-pointer text-zinc-300 hover:bg-white/[0.04]" : "text-zinc-500"
            }`}
            onClick={h.onClick}
          >
            <span>{h.label}</span>
            <span className="flex items-center gap-1">
              {h.keys.map((key) => (
                <kbd key={key} className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
                  {key}
                </kbd>
              ))}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
