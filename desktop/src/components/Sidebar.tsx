import { memo } from "react";
import { motion } from "motion/react";
import ActivityBar from "./ActivityBar";
import FileTree from "./FileTree";
import SourceControl from "./SourceControl";
import Search from "./Search";
import OpenEditors from "./OpenEditors";
import { useSetting } from "../lib/settings";
import {
  NewFileIcon,
  NewFolderIcon,
  RefreshIcon,
  CollapseAllIcon,
  ExtensionsIcon,
  BrowserIcon,
} from "../lib/icons/ui";
import type { ComponentType } from "react";
import type { UIIconProps, SidebarProps, OpenEditorsProps } from "../types";

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

function PanelContent({
  view,
  rootPath,
  folderLabel,
  actions,
  expanded,
  onToggle,
  onExpandPaths,
  refreshNonce,
  onNewFile,
  onNewFolder,
  onRefresh,
  onCollapseAll,
  onOpenBrowser,
  onOpenPalette: _onOpenPalette,
  onChangeWorkspace,
  onGoHome,
  onOpenDiff,
  onOpenSearch,
  onTargetDirChange,
  onError,
  searchScope,
  openEditors,
}: {
  view: SidebarProps["view"];
  rootPath: string;
  folderLabel: string;
  actions: SidebarProps["actions"];
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onExpandPaths: (paths: string[]) => void;
  refreshNonce: number;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
  onCollapseAll: () => void;
  onOpenBrowser?: () => void;
  onOpenPalette: () => void;
  onChangeWorkspace: () => void;
  onGoHome: () => void;
  onOpenDiff?: (filePath: string) => void;
  onOpenSearch?: (scopePath: string) => void;
  onTargetDirChange?: (dir: string) => void;
  onError?: (message: string) => void;
  searchScope?: string | null;
  openEditors?: OpenEditorsProps;
}) {
  return view === "explorer" ? (
    <div className="flex min-h-0 flex-1 flex-col">
      {openEditors && <OpenEditors {...openEditors} />}
      <div className="group flex items-center justify-between px-2 pb-1 pt-1">
        <span className="truncate pl-2 text-[11px] font-bold uppercase tracking-wide text-zinc-300" title={rootPath}>
          {folderLabel}
        </span>
        <div className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
          <ToolbarButton label="New File" onClick={onNewFile}><NewFileIcon size={15} /></ToolbarButton>
          <ToolbarButton label="New Folder" onClick={onNewFolder}><NewFolderIcon size={15} /></ToolbarButton>
          <ToolbarButton label="Refresh Explorer" onClick={onRefresh}><RefreshIcon size={15} /></ToolbarButton>
          <ToolbarButton label="Collapse Folders" onClick={onCollapseAll}><CollapseAllIcon size={15} /></ToolbarButton>
          {onOpenBrowser && (
            <ToolbarButton label="Open Simple Browser" onClick={onOpenBrowser}><BrowserIcon size={14} /></ToolbarButton>
          )}
        </div>
      </div>
      <FileTree
        rootPath={rootPath}
        actions={actions}
        expanded={expanded}
        onToggle={onToggle}
        onExpandPaths={onExpandPaths}
        refreshNonce={refreshNonce}
        onRefresh={onRefresh}
        onChangeWorkspace={onChangeWorkspace}
        onGoHome={onGoHome}
        onOpenSearch={onOpenSearch}
        onTargetDirChange={onTargetDirChange}
        onError={onError}
      />
    </div>
  ) : view === "search" ? (
    <Search rootPath={rootPath} scope={searchScope ?? null} onOpenFile={actions.onOpenFile} />
  ) : view === "scm" ? (
    <SourceControl rootPath={rootPath} onOpenDiff={onOpenDiff} />
  ) : (
    <Placeholder Icon={ExtensionsIcon} title="Extensions" body="An extension marketplace is planned." />
  );
}

export default memo(function Sidebar(props: SidebarProps) {
  const { view, width, onSelectView, onOpenSettings } = props;
  const layoutMode = useSetting("layoutMode");

  const panel = (
    <PanelContent
      view={view}
      rootPath={props.rootPath}
      folderLabel={props.folderLabel}
      actions={props.actions}
      expanded={props.expanded}
      onToggle={props.onToggle}
      onExpandPaths={props.onExpandPaths}
      refreshNonce={props.refreshNonce}
      onNewFile={props.onNewFile}
      onNewFolder={props.onNewFolder}
      onRefresh={props.onRefresh}
      onCollapseAll={props.onCollapseAll}
      onOpenBrowser={props.onOpenBrowser}
      onOpenPalette={props.onOpenPalette}
      onChangeWorkspace={props.onChangeWorkspace}
      onGoHome={props.onGoHome}
      onOpenDiff={props.onOpenDiff}
      onOpenSearch={props.onOpenSearch}
      onTargetDirChange={props.onTargetDirChange}
      onError={props.onError}
      searchScope={props.searchScope}
      openEditors={props.openEditors}
    />
  );

  // ── Aether: Activity bar at the top ─────────────────────────────────
  if (layoutMode === "aether") {
    return (
      <aside style={{ width }} className="flex shrink-0 flex-col border-r border-white/[0.05] bg-panel">
        <ActivityBar activeView={view} onSelect={onSelectView} onOpenSettings={onOpenSettings} vertical={false} />
        {panel}
      </aside>
    );
  }

  // ── VSCode / Compact: Activity bar on the left edge ─────────────────
  return (
    <div style={{ width }} className="flex shrink-0 border-r border-white/[0.05]">
      <ActivityBar
        activeView={view}
        onSelect={onSelectView}
        onOpenSettings={onOpenSettings}
        vertical
        compact={layoutMode === "compact"}
      />
      <aside className="flex min-w-0 flex-1 flex-col bg-panel">{panel}</aside>
    </div>
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
      <span className="text-zinc-500"><Icon size={30} /></span>
      <div>
        <p className="text-sm font-medium text-zinc-300">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{body}</p>
      </div>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="mt-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-accent/50 hover:text-white">
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
}
