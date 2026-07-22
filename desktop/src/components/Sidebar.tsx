import { memo } from "react";
import { motion } from "motion/react";
import ActivityBar from "./ActivityBar";
import FileTree from "./FileTree";
import SourceControl from "./SourceControl";
import {
  NewFileIcon,
  NewFolderIcon,
  RefreshIcon,
  CollapseAllIcon,
  ExtensionsIcon,
  GoToFileIcon,
} from "../lib/icons/ui";
import type { ComponentType } from "react";
import type { UIIconProps, SidebarProps } from "../types";

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-zinc-200"
    >
      {children}
    </motion.button>
  );
}

export default memo(function Sidebar({
  view,
  rootPath,
  folderLabel,
  width,
  actions,
  expanded,
  onToggle,
  refreshNonce,
  onNewFile,
  onNewFolder,
  onRefresh,
  onCollapseAll,
  onOpenPalette,
  onSelectView,
  onOpenSettings,
  onChangeWorkspace,
  onGoHome,
  onOpenDiff,
}: SidebarProps) {
  return (
    <aside style={{ width }} className="flex shrink-0 flex-col border-r border-white/[0.05] bg-panel">
      <ActivityBar activeView={view} onSelect={onSelectView} onOpenSettings={onOpenSettings} />

      {view === "explorer" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="group flex items-center justify-between px-2 pb-1">
            <span
              className="truncate pl-2 text-[11px] font-bold uppercase tracking-wide text-zinc-300"
              title={rootPath}
            >
              {folderLabel}
            </span>
            <div className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
              <ToolbarButton label="New File" onClick={onNewFile}>
                <NewFileIcon size={15} />
              </ToolbarButton>
              <ToolbarButton label="New Folder" onClick={onNewFolder}>
                <NewFolderIcon size={15} />
              </ToolbarButton>
              <ToolbarButton label="Refresh Explorer" onClick={onRefresh}>
                <RefreshIcon size={15} />
              </ToolbarButton>
              <ToolbarButton label="Collapse Folders" onClick={onCollapseAll}>
                <CollapseAllIcon size={15} />
              </ToolbarButton>
            </div>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <FileTree
              rootPath={rootPath}
              actions={actions}
              expanded={expanded}
              onToggle={onToggle}
              refreshNonce={refreshNonce}
              onChangeWorkspace={onChangeWorkspace}
              onGoHome={onGoHome}
            />
          </div>
        </div>
      ) : view === "search" ? (
        <Placeholder
          Icon={GoToFileIcon}
          title="Search"
          body="Full-text search is coming soon."
          actionLabel="Open Quick Search"
          onAction={onOpenPalette}
        />
      ) : view === "scm" ? (
        <SourceControl rootPath={rootPath} onOpenDiff={onOpenDiff} />
      ) : (
        <Placeholder Icon={ExtensionsIcon} title="Extensions" body="An extension marketplace is planned." />
      )}
    </aside>
  );
});

function Placeholder({
  Icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  Icon: ComponentType<UIIconProps>;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <span className="text-zinc-500">
        <Icon size={30} />
      </span>
      <div>
        <p className="text-sm font-medium text-zinc-300">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{body}</p>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-accent/50 hover:text-white"
        >
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
}
