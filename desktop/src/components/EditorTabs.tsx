import { memo } from "react";
import { AnimatePresence, motion, Reorder } from "motion/react";
import { FileTypeIcon } from "../lib/icons";
import { BrowserIcon, SplitIcon } from "../lib/icons/ui";
import Favicon from "./Favicon";
import { CloseGlyph, DiffGlyph } from "../icons";
import { baseName } from "../lib/fs";
import { browserLabel, isBrowserPath, urlFromBrowserPath } from "../lib/browser";
import type { EditorTabsProps } from "../types";

const DIFF_PREFIX = "diff:";

function isDiffPath(p: string): boolean {
  return p.startsWith(DIFF_PREFIX);
}

function realPathFromDiff(p: string): string {
  return p.slice(DIFF_PREFIX.length);
}

function tabLabel(path: string): string {
  if (isBrowserPath(path)) return browserLabel(urlFromBrowserPath(path));
  if (isDiffPath(path)) return baseName(realPathFromDiff(path));
  return baseName(path);
}

export default memo(function EditorTabs({
  tabs,
  activePath,
  onSelect,
  onClose,
  onReorder,
  onSplit,
  onCloseGroup,
  onTabDragStart,
  onTabDrag,
  onTabDragEnd,
}: EditorTabsProps) {
  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-white/[0.06] bg-abyss">
      <Reorder.Group
        as="div"
        axis="x"
        values={tabs}
        onReorder={onReorder}
        role="tablist"
        aria-label="Open editors"
        className="scroll-thin flex min-w-0 flex-1 items-stretch overflow-x-auto"
      >
      <AnimatePresence initial={false}>
        {tabs.map((tab) => {
          const active = tab.path === activePath;
          const diff = isDiffPath(tab.path);
          const browser = isBrowserPath(tab.path);
          const displayName = tab.label ?? tabLabel(tab.path);
          return (
            <Reorder.Item
              as="div"
              value={tab}
              key={tab.path}
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 44 }}
              role="tab"
              tabIndex={0}
              aria-selected={active}
              onClick={() => onSelect(tab.path)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(tab.path);
                }
              }}
              onAuxClick={(e) => {
                if (e.button === 1) onClose(tab.path);
              }}
              onDragStart={() => onTabDragStart?.(tab.path)}
              onDrag={(_e, info) => onTabDrag?.(tab.path, info.point)}
              onDragEnd={(_e, info) => onTabDragEnd?.(tab.path, info.point)}
              title={browser ? urlFromBrowserPath(tab.path) : diff ? realPathFromDiff(tab.path) : tab.path}
              className={`group relative flex min-w-0 max-w-[220px] shrink-0 cursor-pointer items-center gap-2 border-r border-white/[0.05] px-3 text-[13px] transition-colors ${
                active ? "bg-canvas text-white" : "text-zinc-500 hover:bg-white/[0.02] hover:text-zinc-300"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="tab-active"
                  className="absolute inset-x-0 top-0 h-[2px] bg-accent"
                  transition={{ type: "spring", stiffness: 550, damping: 42 }}
                />
              )}
              {browser ? (
                tab.icon ? (
                  <Favicon src={tab.icon} size={14} className="shrink-0" />
                ) : (
                  <BrowserIcon size={14} className="shrink-0" />
                )
              ) : diff ? (
                <DiffGlyph />
              ) : (
                <FileTypeIcon name={baseName(tab.path)} className="shrink-0" />
              )}
              <span className="truncate">{displayName}</span>
              {diff && <span className="shrink-0 text-[10px] text-sky-500">diff</span>}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.path);
                }}
                aria-label={`Close ${displayName}`}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded transition-all hover:bg-white/[0.12] ${
                  tab.dirty ? "text-zinc-300" : "text-zinc-500 opacity-0 group-hover:opacity-100"
                }`}
              >
                {tab.dirty ? <span className="block h-2 w-2 rounded-full bg-current" /> : <CloseGlyph size={11} />}
              </button>
            </Reorder.Item>
          );
        })}
      </AnimatePresence>
      </Reorder.Group>
      {onSplit && (
        <button
          type="button"
          onClick={onSplit}
          title="Split Editor Right"
          aria-label="Split Editor Right"
          className="flex w-9 shrink-0 items-center justify-center border-l border-white/[0.05] text-zinc-500 transition-colors hover:bg-white/[0.03] hover:text-zinc-300"
        >
          <SplitIcon size={14} />
        </button>
      )}
      {onCloseGroup && (
        <button
          type="button"
          onClick={onCloseGroup}
          title="Close Group"
          aria-label="Close Group"
          className="flex w-9 shrink-0 items-center justify-center border-l border-white/[0.05] text-zinc-500 transition-colors hover:bg-white/[0.03] hover:text-zinc-300"
        >
          <CloseGlyph size={12} />
        </button>
      )}
    </div>
  );
});
