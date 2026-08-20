import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GitFile } from "../../types";
import { normalizePath } from "./model";

const POLL_MS = 3000;

export interface GitDecoration {
  letter: string;
  label: string;
  className: string;
}

const DECORATIONS: Record<string, GitDecoration> = {
  M: { letter: "M", label: "Modified", className: "text-amber-300/90" },
  A: { letter: "A", label: "Added", className: "text-emerald-400/90" },
  D: { letter: "D", label: "Deleted", className: "text-red-400/90" },
  R: { letter: "R", label: "Renamed", className: "text-sky-300/90" },
  C: { letter: "C", label: "Copied", className: "text-sky-300/90" },
  U: { letter: "U", label: "Conflicted", className: "text-orange-400" },
  "?": { letter: "U", label: "Untracked", className: "text-emerald-400/90" },
};

const ROLLUP: GitDecoration = { letter: "", label: "Contains changes", className: "text-amber-300/90" };

export interface GitDecorations {
  /** Decoration for a file, or the rolled-up marker for a folder with changes. */
  of: (path: string, isDir: boolean) => GitDecoration | null;
}

const EMPTY: GitDecorations = { of: () => null };

export function useGitDecorations(root: string, enabled: boolean, refreshNonce: number): GitDecorations {
  const [files, setFiles] = useState<Map<string, string>>(() => new Map());
  const [dirtyDirs, setDirtyDirs] = useState<Set<string>>(() => new Set());
  const signature = useRef("");

  const poll = useCallback(async () => {
    if (!enabled || !root) return;
    try {
      const status = await invoke<GitFile[]>("git_status", { root });
      const next = status.map((f) => `${f.status}:${f.path}`).join("\n");
      if (next === signature.current) return;
      signature.current = next;

      const base = normalizePath(root);
      const fileMap = new Map<string, string>();
      const dirs = new Set<string>();
      for (const file of status) {
        const rel = normalizePath(file.path);
        const absolute = `${base}/${rel}`;
        fileMap.set(absolute, file.status);
        let cursor = absolute;
        for (;;) {
          const cut = cursor.lastIndexOf("/");
          if (cut <= base.length - 1) break;
          cursor = cursor.slice(0, cut);
          if (dirs.has(cursor)) break;
          dirs.add(cursor);
        }
      }
      setFiles(fileMap);
      setDirtyDirs(dirs);
    } catch {
      signature.current = "";
      setFiles(new Map());
      setDirtyDirs(new Set());
    }
  }, [root, enabled]);

  useEffect(() => {
    signature.current = "";
  }, [root]);

  useEffect(() => {
    if (!enabled) {
      setFiles(new Map());
      setDirtyDirs(new Set());
      return;
    }
    void poll();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [poll, enabled, refreshNonce]);

  return useMemo(() => {
    if (!enabled) return EMPTY;
    return {
      of: (path, isDir) => {
        const key = normalizePath(path);
        if (isDir) return dirtyDirs.has(key) ? ROLLUP : null;
        const status = files.get(key);
        return status ? DECORATIONS[status] ?? null : null;
      },
    };
  }, [enabled, files, dirtyDirs]);
}
