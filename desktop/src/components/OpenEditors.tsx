import { memo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileTypeIcon } from "../lib/icons";
import { BrowserIcon, ChevronDownIcon, ChevronRightIcon, ClearIcon } from "../lib/icons/ui";
import Favicon from "./Favicon";
import { CloseGlyph, DiffGlyph } from "../icons";
import { baseName, dirName } from "../lib/fs";
import { browserLabel, isBrowserPath, urlFromBrowserPath } from "../lib/browser";
import { TAB_DND_TYPE as DND_TYPE } from "../lib/dnd";
import type { OpenEditorsProps, OpenTab } from "../types";

const DIFF_PREFIX = "diff:";
const ROW_HEIGHT = 22;
const MAX_VISIBLE_ROWS = 12;

function describe(path: string): { label: string; hint: string } {
  if (isBrowserPath(path)) {
    const url = urlFromBrowserPath(path);
    return { label: browserLabel(url), hint: url };
  }
  if (path.startsWith(DIFF_PREFIX)) {
    const real = path.slice(DIFF_PREFIX.length);
    return { label: baseName(real), hint: real };
  }
  return { label: baseName(path), hint: dirName(path) };
}

function Row({
  tab,
  active,
  onSelect,
  onClose,
}: {
  tab: OpenTab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const { label: derived, hint } = describe(tab.path);
  const label = tab.label ?? derived;
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        title={hint}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DND_TYPE, tab.path);
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        onAuxClick={(e) => {
          if (e.button === 1) onClose();
        }}
        style={{ height: ROW_HEIGHT }}
        className={`group/row flex w-full cursor-pointer items-center gap-1.5 pl-2 pr-1.5 text-[13px] outline-none transition-colors ${
          active ? "bg-white/[0.06] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label={`Close ${label}`}
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded transition-all hover:bg-white/[0.12] ${
            tab.dirty ? "text-zinc-300" : "text-zinc-500 opacity-0 group-hover/row:opacity-100"
          }`}
        >
          {tab.dirty ? <span className="block h-2 w-2 rounded-full bg-current" /> : <CloseGlyph size={10} />}
        </button>
        {isBrowserPath(tab.path) ? (
          tab.icon ? (
            <Favicon src={tab.icon} size={14} className="shrink-0" />
          ) : (
            <BrowserIcon size={14} className="shrink-0" />
          )
        ) : tab.path.startsWith(DIFF_PREFIX) ? (
          <DiffGlyph />
        ) : (
          <FileTypeIcon name={label} className="shrink-0" />
        )}
        <span className="truncate">{label}</span>
      </div>
    </li>
  );
}

/**
 * VS Code's Open Editors list. Collapsed by default so it doesn't eat tree
 * space, and capped in height once open. Split groups each get their own
 * section once there's more than one; dragging a row onto another section
 * (or onto an editor pane in the main content area) moves it there.
 */
export default memo(function OpenEditors({
  groups,
  activeGroupId,
  activePath,
  expanded,
  onToggleExpanded,
  onSelect,
  onClose,
  onCloseAll,
  onMoveToGroup,
}: OpenEditorsProps) {
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const total = groups.reduce((n, g) => n + g.tabs.length, 0);
  if (total === 0) return null;
  const split = groups.length > 1;

  return (
    <div className="shrink-0 border-b border-white/[0.05]">
      <div className="group flex h-6 items-center gap-1 pl-1 pr-2">
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-1 rounded text-left text-[11px] font-bold uppercase tracking-wide text-zinc-400 transition-colors hover:text-zinc-200"
        >
          <span className="flex w-4 justify-center text-zinc-500">
            {expanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
          </span>
          <span className="truncate">Open Editors</span>
          <span className="shrink-0 text-[10px] font-normal tabular-nums text-zinc-600">{total}</span>
        </button>
        <button
          type="button"
          onClick={onCloseAll}
          title="Close All Editors"
          aria-label="Close All Editors"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 opacity-0 transition-all hover:bg-white/[0.07] hover:text-zinc-200 group-hover:opacity-100"
        >
          <ClearIcon size={13} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 44, opacity: { duration: 0.12 } }}
            className="scroll-thin overflow-y-auto overflow-x-hidden"
            style={{ maxHeight: MAX_VISIBLE_ROWS * ROW_HEIGHT + (split ? groups.length * 18 : 0) }}
          >
            {groups.map((group, i) => (
              <div
                key={group.id}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(DND_TYPE)) return;
                  e.preventDefault();
                  setDragOverGroup(group.id);
                }}
                onDragLeave={() => setDragOverGroup((cur) => (cur === group.id ? null : cur))}
                onDrop={(e) => {
                  const path = e.dataTransfer.getData(DND_TYPE);
                  setDragOverGroup(null);
                  if (path) onMoveToGroup(path, group.id);
                }}
                className={dragOverGroup === group.id ? "bg-accent/10 ring-1 ring-inset ring-accent/40" : ""}
              >
                {split && (
                  <div
                    className={`px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide ${
                      group.id === activeGroupId ? "text-zinc-400" : "text-zinc-600"
                    }`}
                  >
                    Group {i + 1}
                  </div>
                )}
                <ul>
                  {group.tabs.map((tab) => (
                    <Row
                      key={tab.path}
                      tab={tab}
                      active={tab.path === activePath && group.id === activeGroupId}
                      onSelect={() => onSelect(tab.path, group.id)}
                      onClose={() => onClose(tab.path, group.id)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
