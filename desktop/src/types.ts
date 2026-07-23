import type { ComponentType, FC, SVGProps } from "react";

// ── lib/icons/types.ts ────────────────────────────────────────────────
export interface FileIconProps {
  name: string;
  size?: number;
  className?: string;
}

export interface FolderIconProps {
  name: string;
  open: boolean;
  size?: number;
  className?: string;
}

export interface IconTheme {
  id: string;
  label: string;
  FileIcon: ComponentType<FileIconProps>;
  FolderIcon: ComponentType<FolderIconProps>;
}

// ── lib/icons/ui.tsx ──────────────────────────────────────────────────
export interface UIIconProps {
  size?: number;
  className?: string;
}

export type SvgComp = FC<SVGProps<SVGSVGElement>>;

// ── Virtual URIs ──────────────────────────────────────────────────────
export const SETTINGS_URI = "aether:settings";
export type LayoutMode = "vscode" | "aether" | "compact";

// ── lib/icons/aether.tsx ──────────────────────────────────────────────
export interface AetherManifest {
  file: string;
  folder: string;
  folderExpanded: string;
  fileNames: Record<string, string>;
  fileExtensions: Record<string, string>;
  folderNames: Record<string, string>;
  folderNamesExpanded: Record<string, string>;
}

// ── lib/ai.ts ─────────────────────────────────────────────────────────
export type Brain = "claude" | "lm-studio" | "mercury";

export interface AiSettings {
  brain: Brain;
  claudeModel: string;
  apiKey: string;
  lmStudioBaseUrl: string;
  lmStudioModel: string;
  maxTokens: number;
  reasoningEffort: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export type AiEvent =
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface CompletionOptions {
  system: string;
  messages: ChatMessage[];
  onToken: (text: string) => void;
  onReplace?: (text: string) => void;
}

// ── lib/settings.ts ───────────────────────────────────────────────────
export interface Settings {
  iconTheme: string;
  sidebarVisible: boolean;
  sidebarWidth: number;
  terminalVisible: boolean;
  layoutMode: string;
}

// ── lib/fs.ts ─────────────────────────────────────────────────────────
export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface FileTextResult {
  path: string;
  text?: string;
}

export interface IndexedFile {
  path: string;
  rel: string;
}

// ── lib/commands.ts ───────────────────────────────────────────────────
export interface Command {
  id: string;
  title: string;
  category?: string;
  keywords?: string;
  shortcut?: string;
  icon?: ComponentType<UIIconProps>;
  enabled?: boolean;
  run: () => void;
}

// ── lib/pty.ts ────────────────────────────────────────────────────────
export type PtyEvent = { type: "output"; data: string } | { type: "exit"; code: number };

export type ShellKind = "powershell" | "cmd";

export interface PtyCallbacks {
  onOutput: (text: string) => void;
  onExit: (code: number) => void;
}

export type ReasoningEffort = "instant" | "low" | "medium" | "high";

// ── lib/monaco/lineDiff.ts ────────────────────────────────────────────
export interface DiffHunk {
  proposedStartLine: number;
  addedCount: number;
  removedLines: string[];
}

// ── lib/monaco/aiEdit.ts ──────────────────────────────────────────────
export type Mode = "edit" | "question";

export type Status = "input" | "streaming" | "done" | "error";

export interface Turn {
  role: "user" | "assistant";
  content: string;
  code?: string;
}

export interface AiState {
  gen: number;
  mode: Mode;
  from: number;
  to: number;
  originalFrom: number;
  originalTo: number;
  originalText: string;
  status: Status;
  turns: Turn[];
  streamingText: string;
  error: string;
}

// ── components/ActivityBar.tsx ────────────────────────────────────────
export type ViewId = "explorer" | "search" | "scm" | "extensions" | "settings";

export interface ActivityBarItem {
  id: ViewId;
  label: string;
  Icon: ComponentType<UIIconProps>;
}

export interface ActivityBarProps {
  activeView: ViewId;
  onSelect: (id: ViewId) => void;
  onOpenSettings: () => void;
  vertical?: boolean;
  compact?: boolean;
}

// ── components/FileIcon.tsx ───────────────────────────────────────────
export interface FileGlyphProps {
  name: string;
  className?: string;
}

// ── components/EditorTabs.tsx ─────────────────────────────────────────
export interface OpenTab {
  path: string;
  dirty: boolean;
}

export interface EditorTabsProps {
  tabs: OpenTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onReorder: (tabs: OpenTab[]) => void;
}

// ── components/FileTree.tsx ───────────────────────────────────────────
export interface TreeActions {
  activePath: string | null;
  onOpenFile: (path: string) => void;
  creating: { parentPath: string; isDir: boolean } | null;
  onBeginCreate: (parentDir: string, isDir: boolean) => void;
  onCommitCreate: (name: string) => void;
  onCancelCreate: () => void;
  renamingPath: string | null;
  onBeginRename: (path: string) => void;
  onCommitRename: (newName: string) => void;
  onCancelRename: () => void;
  deletingPath: string | null;
  onBeginDelete: (path: string, isDir: boolean) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onMoveEntry: (sourcePath: string, targetDir: string) => void;
}

export interface InternalCtx extends TreeActions {
  openMenu: (x: number, y: number, entry: DirEntry | null) => void;
  rootPath: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  refreshNonce: number;
  onChangeWorkspace: () => void;
  onGoHome: () => void;
  draggingPath: string | null;
  setDraggingPath: (p: string | null) => void;
  dragOverPath: string | null;
  setDragOverPath: (p: string | null) => void;
  selectedPaths: Set<string>;
  setSelectedPaths: (paths: Set<string>) => void;
  lastClickedPath: string | null;
  setLastClickedPath: (p: string | null) => void;
  clipboard: { paths: string[]; operation: "copy" | "cut" } | null;
  setClipboard: (state: { paths: string[]; operation: "copy" | "cut" } | null) => void;
}

export interface FileTreeProps {
  rootPath: string;
  actions: TreeActions;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  refreshNonce: number;
  onChangeWorkspace: () => void;
  onGoHome: () => void;
}

export interface MenuState {
  x: number;
  y: number;
  entry: DirEntry | null;
}

export interface MIProps {
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

// ── components/SourceControl.tsx ───────────────────────────────────────
export interface GitFile {
  path: string;
  status: string;
}

export interface SourceControlProps {
  rootPath: string;
  onOpenDiff?: (filePath: string) => void;
}

// ── components/CodeEditor.tsx ─────────────────────────────────────────
export interface CursorPos {
  line: number;
  col: number;
}

export interface CodeEditorProps {
  path: string;
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  onCursor?: (pos: CursorPos) => void;
  openPaths?: string[];
}

// ── components/CommandPalette.tsx ──────────────────────────────────────
export type PaletteMode = "files" | "commands";

export interface CommandPaletteProps {
  open: boolean;
  mode: PaletteMode;
  files: IndexedFile[];
  commands: Command[];
  onClose: () => void;
  onOpenFile: (path: string) => void;
}

export interface FileItem {
  kind: "file";
  file: IndexedFile;
  text: string;
  indexes: readonly number[];
}

export interface CommandItem {
  kind: "command";
  command: Command;
  text: string;
  indexes: readonly number[];
}

export type PaletteItem = FileItem | CommandItem;

// ── components/CommitHistory.tsx ──────────────────────────────────────
export interface CommitHistoryProps {
  rootPath: string;
}

// ── components/SettingsPanel.tsx ───────────────────────────────────────
export interface SettingsPanelProps {
  section: SettingsSection;
  onSectionChange?: (section: SettingsSection) => void;
}

export type SettingsSection = "appearance" | "models" | "ai-tools" | "ai-config";

// ── components/Breadcrumbs.tsx ─────────────────────────────────────────
export interface BreadcrumbsProps {
  relPath: string | null;
}

// ── components/MonacoDiffEditor.tsx ───────────────────────────────────
export interface MonacoDiffEditorProps {
  original: string;
  modified: string;
  filePath: string;
}

// ── components/DiffEditor.tsx ─────────────────────────────────────────
export interface DiffEditorProps {
  diff: string;
}

// ── components/Sidebar.tsx ────────────────────────────────────────────
export interface SidebarProps {
  view: ViewId;
  rootPath: string;
  folderLabel: string;
  width: number;
  actions: TreeActions;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  refreshNonce: number;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
  onCollapseAll: () => void;
  onOpenPalette: () => void;
  onSelectView: (id: ViewId) => void;
  onOpenSettings: () => void;
  onChangeWorkspace: () => void;
  onGoHome: () => void;
  onOpenDiff?: (filePath: string) => void;
  settingsSection?: SettingsSection;
  onSelectSettingsSection?: (section: SettingsSection) => void;
}

// ── components/StatusBar.tsx ──────────────────────────────────────────
export interface StatusBarProps {
  cursor: CursorPos | null;
  language: string | null;
  iconThemeLabel: string;
  onPickIconTheme: () => void;
}

// ── components/Terminal.tsx ───────────────────────────────────────────
export interface TerminalProps {
  rootPath: string;
  shell: ShellKind;
  visible: boolean;
}

// ── components/TerminalPanel.tsx ──────────────────────────────────────
export interface TerminalPanelProps {
  rootPath: string;
  visible: boolean;
}

export interface TerminalTab {
  id: string;
  shell: ShellKind;
  label: string;
}

// ── components/Topbar.tsx ─────────────────────────────────────────────
export interface TopbarProps {
  hasWorkspace: boolean;
}

// ── components/Welcome.tsx ────────────────────────────────────────────
export interface WelcomeProps {
  onOpenFolder: (path: string) => void;
}

// ── components/Workspace.tsx ──────────────────────────────────────────
export interface WorkspaceProps {
  path: string;
  onClose: () => void;
  onChangeWorkspace: (path: string) => void;
}

export interface FileBuffer {
  value: string;
  saved: string;
  error?: string;
}

// ── components/AiSettings.tsx ─────────────────────────────────────────
export interface AiSettingsProps {
  open: boolean;
  onClose: () => void;
}
