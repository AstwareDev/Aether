import { useCallback, useMemo, useState } from "react";
import { createEntry, copyEntry, deleteEntry, renameEntry, writeFileText } from "../fs";
import type { FsOperation } from "../../types";

const LIMIT = 64;

export interface FsHistory {
  record: (op: FsOperation) => void;
  undo: () => Promise<FsOperation | null>;
  redo: () => Promise<FsOperation | null>;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
}

/** True when the operation can be reversed without data we never captured. */
export function isUndoable(op: FsOperation): boolean {
  return !(op.kind === "delete" && (op.isDir || op.content === null));
}

async function revert(op: FsOperation): Promise<void> {
  switch (op.kind) {
    case "create":
    case "copy":
      await deleteEntry(op.to);
      return;
    case "move":
      await renameEntry(op.to, op.from);
      return;
    case "delete":
      await createEntry(op.to, op.isDir);
      if (!op.isDir && op.content) await writeFileText(op.to, op.content);
  }
}

async function reapply(op: FsOperation): Promise<void> {
  switch (op.kind) {
    case "create":
      await createEntry(op.to, op.isDir);
      return;
    case "copy":
      await copyEntry(op.from, op.to);
      return;
    case "move":
      await renameEntry(op.from, op.to);
      return;
    case "delete":
      await deleteEntry(op.to);
  }
}

/**
 * Undo/redo for explorer file operations. Deletes are only reversible when the
 * file's contents were captured before the delete, so irreversible entries stop
 * the stack rather than silently doing nothing.
 */
export function useFsHistory(): FsHistory {
  const [past, setPast] = useState<FsOperation[]>([]);
  const [future, setFuture] = useState<FsOperation[]>([]);

  const record = useCallback((op: FsOperation) => {
    setPast((prev) => [...prev, op].slice(-LIMIT));
    setFuture([]);
  }, []);

  const undo = useCallback(async () => {
    const op = past[past.length - 1];
    if (!op || !isUndoable(op)) return null;
    await revert(op);
    setPast((prev) => prev.slice(0, -1));
    setFuture((prev) => [...prev, op]);
    return op;
  }, [past]);

  const redo = useCallback(async () => {
    const op = future[future.length - 1];
    if (!op) return null;
    await reapply(op);
    setFuture((prev) => prev.slice(0, -1));
    setPast((prev) => [...prev, op]);
    return op;
  }, [future]);

  const clear = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  const last = past[past.length - 1];
  return useMemo(
    () => ({
      record,
      undo,
      redo,
      canUndo: !!last && isUndoable(last),
      canRedo: future.length > 0,
      clear,
    }),
    [record, undo, redo, last, future.length, clear],
  );
}
