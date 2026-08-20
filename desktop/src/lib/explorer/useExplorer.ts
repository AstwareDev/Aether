import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readDir } from "../fs";
import type { DirEntry, TreeRow } from "../../types";
import { entriesEqual, flattenTree } from "./model";

const REVALIDATE_MS = 4000;
const PREFETCH_FANOUT = 64;

export interface ExplorerModel {
  rows: TreeRow[];
  entriesOf: (dirPath: string) => DirEntry[] | undefined;
  ready: boolean;
  error: string | null;
  invalidate: (dirPath?: string) => void;
}

/**
 * Owns the directory cache behind the tree. Directories load on demand as they
 * are expanded, single-child folders are prefetched so compact chains can form,
 * and everything currently visible is revalidated on a timer and on window
 * focus so on-disk changes show up without a manual refresh.
 */
export function useExplorer(
  root: string,
  expanded: ReadonlySet<string>,
  refreshNonce: number,
  compact: boolean,
): ExplorerModel {
  const [dirs, setDirs] = useState<ReadonlyMap<string, DirEntry[]>>(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const dirsRef = useRef(dirs);
  dirsRef.current = dirs;
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    setDirs(new Map());
    setError(null);
    inFlight.current.clear();
  }, [root]);

  const commit = useCallback((dirPath: string, entries: DirEntry[]) => {
    setDirs((prev) => {
      if (entriesEqual(prev.get(dirPath), entries)) return prev;
      const next = new Map(prev);
      next.set(dirPath, entries);
      return next;
    });
  }, []);

  const load = useCallback(
    async (dirPath: string, force: boolean) => {
      if (!force && (dirsRef.current.has(dirPath) || inFlight.current.has(dirPath))) return;
      if (inFlight.current.has(dirPath)) return;
      inFlight.current.add(dirPath);
      try {
        const entries = await readDir(dirPath);
        commit(dirPath, entries);
        if (dirPath === root) setError(null);
      } catch (err) {
        if (dirPath === root) setError(String(err));
        else commit(dirPath, []);
      } finally {
        inFlight.current.delete(dirPath);
      }
    },
    [commit, root],
  );

  const visibleDirs = useMemo(() => {
    const out = [root];
    for (const path of expanded) out.push(path);
    return out;
  }, [root, expanded]);

  useEffect(() => {
    for (const dirPath of visibleDirs) void load(dirPath, false);
  }, [visibleDirs, load]);

  // Compact chains are built from the cache, so every subdirectory one level
  // below a visible folder is prefetched and single-child runs are followed to
  // their end. Wide folders are skipped: the prefetch is a nicety, not worth a
  // thousand reads.
  useEffect(() => {
    if (!compact) return;
    const pending: string[] = [];
    for (const dirPath of visibleDirs) {
      const entries = dirs.get(dirPath);
      if (!entries || entries.length > PREFETCH_FANOUT) continue;
      for (const entry of entries) {
        if (!entry.is_dir) continue;
        let cursor: DirEntry | undefined = entry;
        for (let depth = 0; cursor && depth < 32; depth++) {
          const children: DirEntry[] | undefined = dirs.get(cursor.path);
          if (!children) {
            pending.push(cursor.path);
            break;
          }
          cursor = children.length === 1 && children[0].is_dir ? children[0] : undefined;
        }
      }
    }
    for (const dirPath of pending) void load(dirPath, false);
  }, [compact, visibleDirs, dirs, load]);

  const revalidateVisible = useCallback(() => {
    for (const dirPath of visibleDirs) void load(dirPath, true);
  }, [visibleDirs, load]);

  const revalidateAll = useCallback(() => {
    for (const dirPath of dirsRef.current.keys()) void load(dirPath, true);
  }, [load]);

  useEffect(() => {
    if (refreshNonce === 0) return;
    revalidateAll();
  }, [refreshNonce, revalidateAll]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible" && document.hasFocus()) revalidateVisible();
    };
    const id = window.setInterval(tick, REVALIDATE_MS);
    window.addEventListener("focus", revalidateVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", revalidateVisible);
    };
  }, [revalidateVisible]);

  const invalidate = useCallback(
    (dirPath?: string) => {
      if (dirPath) void load(dirPath, true);
      else revalidateAll();
    },
    [load, revalidateAll],
  );

  const rows = useMemo(
    () => flattenTree({ root, dirs, expanded, compact }),
    [root, dirs, expanded, compact],
  );

  const entriesOf = useCallback((dirPath: string) => dirsRef.current.get(dirPath), []);

  return { rows, entriesOf, ready: dirs.has(root), error, invalidate };
}
