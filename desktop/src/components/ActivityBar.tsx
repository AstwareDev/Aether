import { memo } from "react";
import { motion } from "motion/react";
import {
  FilesIcon,
  SearchIcon,
  ScmIcon,
  ExtensionsIcon,
  SettingsIcon,
} from "../lib/icons/ui";
import type { ActivityBarItem, ActivityBarProps } from "../types";
import { openAiIdeWindow } from "../lib/windows";

const ITEMS: ActivityBarItem[] = [
  { id: "explorer", label: "Explorer", Icon: FilesIcon },
  { id: "search", label: "Search", Icon: SearchIcon },
  { id: "scm", label: "Source Control", Icon: ScmIcon },
  { id: "extensions", label: "Extensions", Icon: ExtensionsIcon },
];

export default memo(function ActivityBar({ activeView, onSelect, vertical, compact }: ActivityBarProps) {
  const isVscode = vertical && !compact;

  const wrapper = vertical
    ? compact
      ? "flex w-10 flex-col items-center border-r border-white/[0.05] bg-panel py-2 gap-1"
      : "flex w-12 flex-col items-center border-r border-white/[0.05] bg-panel py-2.5 gap-2"
    : "flex h-9 w-full shrink-0 flex-row items-center justify-center border-b border-white/[0.05] bg-panel px-2";

  const group = vertical
    ? compact
      ? "flex flex-col items-center gap-1"
      : "flex flex-col items-center gap-2"
    : "flex flex-row items-center gap-0.5";

  const activeIndicator = vertical
    ? compact
      ? "absolute -left-[4px] top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]"
      : "absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent shadow-[0_0_8px_var(--color-accent)]"
    : "absolute -bottom-[4px] left-1/2 h-[2px] w-4 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]";

  const settingsSection = vertical
    ? compact
      ? "mt-auto flex flex-col items-center gap-1"
      : "mt-auto flex flex-col items-center gap-2"
    : "";

  const buttonClass = isVscode ? "h-10 w-10 rounded-xl" : "h-7 w-7 rounded-lg";
  const iconSize = isVscode ? 20 : 14;

  return (
    <div className={wrapper}>
      <div className={group}>
        {ITEMS.map(({ id, label, Icon }) => {
          const active = id === activeView;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-label={label}
              aria-pressed={active}
              title={label}
              className={`group relative flex items-center justify-center transition-colors duration-150 ${buttonClass} ${
                active ? "text-white" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="activity-active"
                  className={activeIndicator}
                  transition={{ type: "spring", stiffness: 550, damping: 42 }}
                />
              )}
              <motion.span whileTap={{ scale: 0.86 }} className="flex items-center justify-center">
                <Icon size={iconSize} />
              </motion.span>
            </button>
          );
        })}
      </div>

      <div className={settingsSection}>
        <button
          type="button"
          onClick={() => openAiIdeWindow()}
          aria-label="AI Code"
          title="Open AI Code"
          className={`group relative flex items-center justify-center text-zinc-500 transition-colors duration-150 hover:text-zinc-200 ${buttonClass}`}
        >
          <motion.span whileTap={{ scale: 0.86 }} className="flex items-center justify-center">
            <svg width={iconSize} height={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </motion.span>
        </button>
        <button
          type="button"
          onClick={() => onSelect("settings")}
          aria-label="Settings"
          aria-pressed={activeView === "settings"}
          title="Settings"
          className={`group relative flex items-center justify-center transition-colors duration-150 ${buttonClass} ${
            activeView === "settings" ? "text-white" : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          {activeView === "settings" && (
            <motion.span
              layoutId="activity-active"
              className={activeIndicator}
              transition={{ type: "spring", stiffness: 550, damping: 42 }}
            />
          )}
          <motion.span whileTap={{ scale: 0.86 }} className="flex items-center justify-center">
            <SettingsIcon size={iconSize} />
          </motion.span>
        </button>
      </div>
    </div>
  );
});
