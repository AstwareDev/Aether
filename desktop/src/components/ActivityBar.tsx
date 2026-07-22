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

const ITEMS: ActivityBarItem[] = [
  { id: "explorer", label: "Explorer", Icon: FilesIcon },
  { id: "search", label: "Search", Icon: SearchIcon },
  { id: "scm", label: "Source Control", Icon: ScmIcon },
  { id: "extensions", label: "Extensions", Icon: ExtensionsIcon },
];

export default memo(function ActivityBar({ activeView, onSelect, onOpenSettings }: ActivityBarProps) {
  return (
    <div className="flex h-9 w-full shrink-0 flex-row items-center justify-center border-b border-white/[0.05] bg-panel px-2">
      <div className="flex flex-row items-center gap-0.5">
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
              className={`group relative flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 ${
                active ? "text-white" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="activity-active"
                  className="absolute -bottom-[4px] left-1/2 h-[2px] w-4 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]"
                  transition={{ type: "spring", stiffness: 550, damping: 42 }}
                />
              )}
              <motion.span whileTap={{ scale: 0.86 }} className="flex items-center justify-center">
                <Icon size={14} />
              </motion.span>
            </button>
          );
        })}
        
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
          className="group relative flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors duration-150 hover:text-zinc-200"
        >
          <motion.span whileTap={{ scale: 0.86 }} className="flex items-center justify-center">
            <SettingsIcon size={14} />
          </motion.span>
        </button>
      </div>
    </div>
  );
});
