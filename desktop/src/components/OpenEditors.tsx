import { memo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileTypeIcon } from "../lib/icons";
import { BrowserIcon, ChevronDownIcon, ChevronRightIcon, ClearIcon } from "../lib/icons/ui";
import { CloseGlyph, DiffGlyph } from "../icons";
import { baseName, dirName } from "../lib/fs";
import { browserLabel, isBrowserPath, urlFromBrowserPath } from "../lib/browser";
import type { OpenEditorsProps } from "../types";

const DIFF_PREFIX = "diff:";
const ROW_HEIGHT = 22;
const MAX_VISIBLE_ROWS = 9;

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

/**
 * VS Code's Open Editors list. Collapsed by default so it doesn't eat tree
 * space, and capped in height once open.
 */
export default memo(function OpenEditors({
  tabs,
  activePath,
  expanded,
  onToggleExpanded,
  onSelect,
  onClose,
  onCloseAll,
}: OpenEditorsProps) {
  if (!tabs.length) return null;

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
          <span className="shrink-0 text-[10px] font-normal tabular-nums text-zinc-600">{tabs.length}</span>
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
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 44, opacity: { duration: 0.12 } }}
            className="scroll-thin overflow-y-auto overflow-x-hidden"
            style={{ maxHeight: MAX_VISIBLE_ROWS * ROW_HEIGHT }}
          >
            {tabs.map((tab) => {
              const { label: derived, hint } = describe(tab.path);
              const label = tab.label ?? derived;
              const active = tab.path === activePath;
              return (
                <li key={tab.path}>
                  <div
                    role="button"
                    tabIndex={0}
                    title={hint}
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
                    style={{ height: ROW_HEIGHT }}
                    className={`group/row flex w-full cursor-pointer items-center gap-1.5 pl-2 pr-1.5 text-[13px] outline-none transition-colors ${
                      active ? "bg-white/[0.06] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose(tab.path);
                      }}
                      aria-label={`Close ${label}`}
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded transition-all hover:bg-white/[0.12] ${
                        tab.dirty ? "text-zinc-300" : "text-zinc-500 opacity-0 group-hover/row:opacity-100"
                      }`}
                    >
                      {tab.dirty ? <span className="block h-2 w-2 rounded-full bg-current" /> : <CloseGlyph size={10} />}
                    </button>
                    {isBrowserPath(tab.path) ? (
                      <BrowserIcon size={14} className="shrink-0" />
                    ) : tab.path.startsWith(DIFF_PREFIX) ? (
                      <DiffGlyph />
                    ) : (
                      <FileTypeIcon name={label} className="shrink-0" />
                    )}
                    <span className="truncate">{label}</span>
                  </div>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
});
