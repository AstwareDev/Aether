import { memo } from "react";
import { motion } from "motion/react";
import ActivityBar from "./ActivityBar";
import FileTree from "./FileTree";
import SourceControl from "./SourceControl";
import Search from "./Search";
import { SETTINGS_SECTIONS, useSetting } from "../lib/settings";
import { SectionIcon } from "../icons";
import {
  NewFileIcon,
  NewFolderIcon,
  RefreshIcon,
  CollapseAllIcon,
  ExtensionsIcon,
} from "../lib/icons/ui";
import type { ComponentType } from "react";
import type { UIIconProps, SidebarProps, SettingsSection } from "../types";

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
  refreshNonce,
  onNewFile,
  onNewFolder,
  onRefresh,
  onCollapseAll,
  onOpenPalette: _onOpenPalette,
  onChangeWorkspace,
  onGoHome,
  onOpenDiff,
  settingsSection,
  onSelectSettingsSection,
}: {
  view: SidebarProps["view"];
  rootPath: string;
  folderLabel: string;
  actions: SidebarProps["actions"];
  expanded: Set<string>;
  onToggle: (path: string) => void;
  refreshNonce: number;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
  onCollapseAll: () => void;
  onOpenPalette: () => void;
  onChangeWorkspace: () => void;
  onGoHome: () => void;
  onOpenDiff?: (filePath: string) => void;
  settingsSection?: SettingsSection;
  onSelectSettingsSection?: (section: SettingsSection) => void;
}) {
  return view === "explorer" ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="group flex items-center justify-between px-2 pb-1">
        <span className="truncate pl-2 text-[11px] font-bold uppercase tracking-wide text-zinc-300" title={rootPath}>
          {folderLabel}
        </span>
        <div className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
          <ToolbarButton label="New File" onClick={onNewFile}><NewFileIcon size={15} /></ToolbarButton>
          <ToolbarButton label="New Folder" onClick={onNewFolder}><NewFolderIcon size={15} /></ToolbarButton>
          <ToolbarButton label="Refresh Explorer" onClick={onRefresh}><RefreshIcon size={15} /></ToolbarButton>
          <ToolbarButton label="Collapse Folders" onClick={onCollapseAll}><CollapseAllIcon size={15} /></ToolbarButton>
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <FileTree rootPath={rootPath} actions={actions} expanded={expanded} onToggle={onToggle} refreshNonce={refreshNonce} onChangeWorkspace={onChangeWorkspace} onGoHome={onGoHome} />
      </div>
    </div>
  ) : view === "search" ? (
    <Search rootPath={rootPath} onOpenFile={actions.onOpenFile} />
  ) : view === "scm" ? (
    <SourceControl rootPath={rootPath} onOpenDiff={onOpenDiff} />
  ) : view === "settings" ? (
    <div className="flex min-h-0 flex-1 flex-col py-2">
      <div className="flex items-center justify-between px-3 pb-2">
        <span className="pl-1 text-[11px] font-bold uppercase tracking-wide text-zinc-300">
          Settings
        </span>
      </div>
      <nav aria-label="Settings sections" className="scroll-thin flex-1 overflow-y-auto px-2">
        <ul className="space-y-1">
          {SETTINGS_SECTIONS.map(({ id, label }) => {
            const active = settingsSection === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSelectSettingsSection?.(id)}
                  className={`focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                    active
                      ? "bg-white/[0.08] text-white"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  <SectionIcon section={id} />
                  <span className="truncate">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  ) : (
    <Placeholder Icon={ExtensionsIcon} title="Extensions" body="An extension marketplace is planned." />
  );
}

export default memo(function Sidebar(props: SidebarProps) {
  const {
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
    onOpenPalette: _onOpenPalette,
    onSelectView,
    onOpenSettings,
    onChangeWorkspace,
    onGoHome,
    onOpenDiff,
    settingsSection,
    onSelectSettingsSection,
  } = props;

  const layoutMode = useSetting("layoutMode");

  // ── Aether: Activity bar at the top ─────────────────────────────────
  if (layoutMode === "aether") {
    return (
      <aside style={{ width }} className="flex shrink-0 flex-col border-r border-white/[0.05] bg-panel">
        <ActivityBar activeView={view} onSelect={onSelectView} onOpenSettings={onOpenSettings} vertical={false} />
        <PanelContent
          view={view} rootPath={rootPath} folderLabel={folderLabel}
          actions={actions} expanded={expanded} onToggle={onToggle}
          refreshNonce={refreshNonce} onNewFile={onNewFile} onNewFolder={onNewFolder}
          onRefresh={onRefresh} onCollapseAll={onCollapseAll} onOpenPalette={_onOpenPalette}
          onChangeWorkspace={onChangeWorkspace} onGoHome={onGoHome} onOpenDiff={onOpenDiff}
          settingsSection={settingsSection} onSelectSettingsSection={onSelectSettingsSection}
        />
      </aside>
    );
  }

  // ── VSCode: Activity bar on the left, settings at the bottom ────────
  if (layoutMode === "vscode") {
    return (
      <div style={{ width }} className="flex shrink-0 border-r border-white/[0.05]">
        <ActivityBar activeView={view} onSelect={onSelectView} onOpenSettings={onOpenSettings} vertical />
        <aside className="flex min-w-0 flex-1 flex-col bg-panel">
          <PanelContent
            view={view} rootPath={rootPath} folderLabel={folderLabel}
            actions={actions} expanded={expanded} onToggle={onToggle}
            refreshNonce={refreshNonce} onNewFile={onNewFile} onNewFolder={onNewFolder}
            onRefresh={onRefresh} onCollapseAll={onCollapseAll} onOpenPalette={_onOpenPalette}
            onChangeWorkspace={onChangeWorkspace} onGoHome={onGoHome} onOpenDiff={onOpenDiff}
            settingsSection={settingsSection} onSelectSettingsSection={onSelectSettingsSection}
          />
        </aside>
      </div>
    );
  }

  // ── Compact: Minimal icon strip, settings at bottom ────────────────
  return (
    <div style={{ width }} className="flex shrink-0 border-r border-white/[0.05]">
      <ActivityBar activeView={view} onSelect={onSelectView} onOpenSettings={onOpenSettings} vertical compact />
      <aside className="flex min-w-0 flex-1 flex-col bg-panel">
        <PanelContent
          view={view} rootPath={rootPath} folderLabel={folderLabel}
          actions={actions} expanded={expanded} onToggle={onToggle}
          refreshNonce={refreshNonce} onNewFile={onNewFile} onNewFolder={onNewFolder}
          onRefresh={onRefresh} onCollapseAll={onCollapseAll} onOpenPalette={_onOpenPalette}
          onChangeWorkspace={onChangeWorkspace} onGoHome={onGoHome} onOpenDiff={onOpenDiff}
          settingsSection={settingsSection} onSelectSettingsSection={onSelectSettingsSection}
        />
      </aside>
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
