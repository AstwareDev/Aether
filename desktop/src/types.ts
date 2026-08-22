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

// ── lib/ai ────────────────────────────────────────────────────────────
export type Wire = "anthropic" | "openai";

export type Effort = "off" | "low" | "medium" | "high";

export interface ModelInfo {
  id: string;
  label: string;
}

export interface ProviderTemplate {
  id: string;
  label: string;
  description: string;
  wire: Wire;
  defaultBaseUrl: string;
  requiresApiKey: boolean;
  supportsModelListing: boolean;
  keyPlaceholder: string;
  catalog: ModelInfo[];
}

export interface ProviderConfig {
  id: string;
  templateId: string | null;
  label: string;
  wire: Wire;
  baseUrl: string;
  apiKey: string;
  models: string[];
  enabled: boolean;
}

export type TaskId = "default" | "inline" | "commit" | "review" | "chat";

export interface TaskAssignment {
  inherit: boolean;
  providerId: string;
  model: string;
  effort: Effort;
  maxTokens: number;
}

export interface ResolvedTask {
  provider: ProviderConfig;
  model: string;
  effort: Effort;
  maxTokens: number;
}

export interface AiConfig {
  providers: ProviderConfig[];
  assignments: Record<TaskId, TaskAssignment>;
  disabledTools: string[];
  maxAgentSteps: number;
  relatedFileBudget: number;
}

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  signature: string;
}

export interface RedactedThinkingBlock {
  type: "redacted_thinking";
  data: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ReasoningBlock = ThinkingBlock | RedactedThinkingBlock;

export type ContentBlock = TextBlock | ReasoningBlock | ToolUseBlock | ToolResultBlock;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export type AiEvent =
  | { type: "delta"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "thinking_block"; thinking: string; signature: string }
  | { type: "redacted_thinking_block"; data: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "done" }
  | { type: "error"; message: string };

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  system: string;
  messages: ChatMessage[];
  onToken: (text: string) => void;
  task?: TaskId;
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

// ── lib/settings.ts ───────────────────────────────────────────────────
export type EditorLineNumbers = "on" | "relative" | "off";
export type ScmView = "changes" | "history" | "agent";
export type ScmViewSwitcher = "dropdown" | "tabs";

export interface Settings {
  iconTheme: string;
  sidebarVisible: boolean;
  sidebarWidth: number;
  terminalVisible: boolean;
  layoutMode: LayoutMode;
  editorFontFamily: string;
  editorFontSize: number;
  editorWordWrap: boolean;
  editorMinimap: boolean;
  editorLineNumbers: EditorLineNumbers;
  explorerCompactFolders: boolean;
  explorerAutoReveal: boolean;
  explorerGitDecorations: boolean;
  explorerOpenEditors: boolean;
  explorerOpenEditorsExpanded: boolean;
  scmViewSwitcher: ScmViewSwitcher;
  scmDefaultView: ScmView;
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
  /** Short label for the tool the agent is currently running, if any. */
  activity: string;
  error: string;
}

// ── components/ActivityBar.tsx ────────────────────────────────────────
export type ViewId = "explorer" | "search" | "scm" | "extensions";

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
  /** Overrides the name derived from the path — a browser tab's current host. */
  label?: string;
  /** Favicon of the page a browser tab is showing. */
  icon?: string | null;
}

export interface EditorTabsProps {
  tabs: OpenTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onReorder: (tabs: OpenTab[]) => void;
  /** Shown as a trailing toolbar button when set — opens a new editor group to the right. */
  onSplit?: () => void;
  /** Shown as a trailing toolbar button when set — closes every tab in this group. */
  onCloseGroup?: () => void;
  /** Dragging a tab past a pane's edge splits it off — these report the drag so Workspace can show the drop overlay and perform the move. `point` is viewport (client) coordinates. */
  onTabDragStart?: (path: string) => void;
  onTabDrag?: (path: string, point: { x: number; y: number }) => void;
  onTabDragEnd?: (path: string, point: { x: number; y: number }) => void;
}

// ── components/Workspace.tsx: editor groups ─────────────────────────────
/** One split pane of the editor area — its own tab strip and active file. */
export interface EditorGroup {
  id: string;
  openPaths: string[];
  activePath: string | null;
}

/** Which edge of a group pane a dragged tab is currently hovering, if any — "move" means the pane's middle (join that group instead of splitting). */
export interface DropZone {
  groupId: string;
  side: "left" | "right" | "move";
}

// ── components/OpenEditors.tsx ────────────────────────────────────────
export interface OpenEditorsGroup {
  id: string;
  tabs: OpenTab[];
}

export interface OpenEditorsProps {
  groups: OpenEditorsGroup[];
  /** Only meaningful when there's more than one group — labels the focused section. */
  activeGroupId: string;
  activePath: string | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSelect: (path: string, groupId: string) => void;
  onClose: (path: string, groupId: string) => void;
  onCloseAll: () => void;
  /** Dropping a row (dragged from here, or from an editor pane) onto a group section moves it there. */
  onMoveToGroup: (path: string, groupId: string) => void;
}

// ── components/BrowserView.tsx ────────────────────────────────────────
// ── lib/browserHost.ts ────────────────────────────────────────────────

/** Logical (CSS) pixels relative to the window client area. */
export interface BrowserViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One step of the inspector's ancestor/child navigation. */
export interface BrowserNodeRef {
  path: string;
  label: string;
}

/** A CSS rule that applies to the inspected element. */
export interface BrowserCssRule {
  selector: string;
  text: string;
  origin: string;
}

/** Framework the element came from, when the page exposes one. */
export interface BrowserComponentInfo {
  framework: string;
  /** Outermost component first. */
  stack: string[];
  props: [string, string][];
  /** `file:line`, only available in some development builds. */
  source: string;
}

/** A snapshot of an inspected element, as the probe sees it. */
export interface BrowserElement {
  path: string;
  /** Shortest selector that still identifies the element on its own. */
  selector: string;
  pageUrl: string;
  pageTitle: string;
  component: BrowserComponentInfo;
  label: string;
  tag: string;
  id: string;
  classes: string[];
  attrs: [string, string][];
  text: string;
  html: string;
  css: BrowserCssRule[];
  rect: { x: number; y: number; width: number; height: number };
  box: { margin: number[]; border: number[]; padding: number[] };
  styles: [string, string][];
  ancestors: BrowserNodeRef[];
  children: BrowserNodeRef[];
}

/** Reported by the probe injected into the page — untrusted remote data. */
export type BrowserSignal =
  | { t: "newdoc"; url: string; time: number }
  | { t: "nav"; url: string }
  | { t: "meta"; url: string; title: string; icon: string | null; time: number }
  | { t: "inspect"; active: boolean; time: number }
  | ({ t: "pick"; time: number } & BrowserElement);

/** Pane chrome that outlives the component, like the open inspector. */
export interface BrowserPaneUi {
  devtoolsOpen: boolean;
  /** Logical pixels; the inspector webview is sized to match. */
  devtoolsWidth: number;
}

/** History of one pane, kept alive across tab switches with the webview it describes. */
export interface BrowserNavState {
  stack: string[];
  cursor: number;
}

/** What a page told us about itself, for the tab strip. */
export interface BrowserPageMeta {
  url: string;
  title: string;
  icon: string | null;
}

// ── components/BrowserView.tsx ────────────────────────────────────────
export interface BrowserViewProps {
  /** Tab identity — the pane's native webview is keyed off this. */
  viewKey: string;
  url: string;
  /** False while another tab or a modal is on top; the native view is OS-level and would paint over it. */
  visible: boolean;
  onUrlChange?: (url: string) => void;
  onMetaChange?: (meta: BrowserPageMeta) => void;
}

// ── components/BrowserStartPage.tsx ───────────────────────────────────
export interface BrowserRecent {
  url: string;
  title: string;
  icon?: string;
}

export interface BrowserStartPageProps {
  recents: BrowserRecent[];
  onNavigate: (input: string) => void;
}

// ── components/BrowserErrorPage.tsx ───────────────────────────────────
export interface BrowserErrorPageProps {
  url: string;
  message: string;
  onRetry: () => void;
  onOpenExternally: () => void;
}

// ── components/Favicon.tsx ────────────────────────────────────────────
export interface FaviconProps {
  src?: string;
  size?: number;
  className?: string;
}

// ── components/FileTree.tsx ───────────────────────────────────────────

/** One segment of a compacted folder chain (`src/lib/icons`). */
export interface TreeSegment {
  name: string;
  path: string;
}

/** A single visible line of the flattened tree. */
export interface TreeRow {
  key: string;
  path: string;
  name: string;
  isDir: boolean;
  depth: number;
  parentPath: string;
  segments: TreeSegment[] | null;
  expanded: boolean;
}

export type FsOperation =
  | { kind: "create"; to: string; isDir: boolean }
  | { kind: "copy"; from: string; to: string }
  | { kind: "move"; from: string; to: string }
  | { kind: "delete"; to: string; isDir: boolean; content: string | null };

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
  onRecord: (op: FsOperation) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export interface FileTreeProps {
  rootPath: string;
  actions: TreeActions;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onExpandPaths: (paths: string[]) => void;
  refreshNonce: number;
  onRefresh: () => void;
  onChangeWorkspace: () => void;
  onGoHome: () => void;
  onOpenSearch?: (scopePath: string) => void;
  /** Opens an HTML file in the in-app browser. */
  onOpenInBrowser?: (filePath: string) => void;
  /** Folder the toolbar's New File/New Folder should target, tracking selection. */
  onTargetDirChange?: (dir: string) => void;
  onError?: (message: string) => void;
}

export interface MenuState {
  x: number;
  y: number;
  row: TreeRow | null;
  targetPath: string | null;
}

export interface MenuAction {
  id: string;
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}

export type MenuEntry = MenuAction | { id: string; separator: true };

// ── components/SourceControl.tsx ───────────────────────────────────────
export interface GitFile {
  path: string;
  status: string;
}

export type ReviewSeverity = "bug" | "security" | "performance" | "improvement";

export interface ReviewIssue {
  id: string;
  file: string;
  line: number;
  title: string;
  description: string;
  severity: ReviewSeverity;
  suggested_fix?: string;
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
  open: boolean;
  section: SettingsSection;
  onSelectSection: (section: SettingsSection) => void;
  onClose: () => void;
}

export type SettingsSection = "appearance" | "explorer" | "source-control";

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
  onExpandPaths: (paths: string[]) => void;
  refreshNonce: number;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
  onCollapseAll: () => void;
  onOpenBrowser?: () => void;
  onOpenPalette: () => void;
  onSelectView: (id: ViewId) => void;
  onOpenSettings: () => void;
  onChangeWorkspace: () => void;
  onGoHome: () => void;
  onOpenDiff?: (filePath: string) => void;
  onOpenSearch?: (scopePath: string) => void;
  onOpenInBrowser?: (filePath: string) => void;
  onTargetDirChange?: (dir: string) => void;
  onError?: (message: string) => void;
  searchScope?: string | null;
  openEditors?: OpenEditorsProps;
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
  /** Opens a URL the shell printed in the in-app browser. */
  onOpenUrl?: (url: string) => void;
}

// ── components/TerminalPanel.tsx ──────────────────────────────────────
export interface TerminalPanelProps {
  rootPath: string;
  visible: boolean;
  onOpenUrl?: (url: string) => void;
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

