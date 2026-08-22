import { createStore } from "./store";
import type { EditorLineNumbers, LayoutMode, ScmView, ScmViewSwitcher, Settings, SettingsSection } from "../types";

const DEFAULTS: Settings = {
  iconTheme: "aether",
  sidebarVisible: true,
  sidebarWidth: 256,
  terminalVisible: false,
  layoutMode: "aether",
  editorFontFamily: "Consolas, 'Courier New', monospace",
  editorFontSize: 14,
  editorWordWrap: true,
  editorMinimap: false,
  editorLineNumbers: "on",
  explorerCompactFolders: true,
  explorerAutoReveal: true,
  explorerGitDecorations: true,
  explorerOpenEditors: true,
  explorerOpenEditorsExpanded: false,
  scmViewSwitcher: "dropdown",
  scmDefaultView: "changes",
};

export const SIDEBAR_WIDTH_RANGE = { min: 180, max: 480 } as const;
export const EDITOR_FONT_SIZE_RANGE = { min: 10, max: 24 } as const;

export const SCM_VIEW_LABELS: Record<ScmView, string> = {
  changes: "Changes",
  history: "History",
  agent: "Agent Review",
};

export const SCM_VIEW_SWITCHER_LABELS: Record<ScmViewSwitcher, string> = {
  dropdown: "Dropdown",
  tabs: "Tabs",
  all: "Stacked",
};

const LAYOUT_MODES: LayoutMode[] = ["aether", "vscode", "compact"];
const LINE_NUMBER_MODES: EditorLineNumbers[] = ["on", "relative", "off"];
const SCM_VIEWS: ScmView[] = ["changes", "history", "agent"];
const SCM_VIEW_SWITCHERS: ScmViewSwitcher[] = ["dropdown", "tabs", "all"];

const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const oneOf = <T extends string>(value: unknown, allowed: T[], fallback: T): T =>
  typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : fallback;

// Values written by older builds are merged over defaults, then range- and
// union-checked: an out-of-range font size or unknown layout mode would
// otherwise reach Monaco or silently select the compact fallback branch.
function hydrate(raw: unknown, defaults: Settings): Settings {
  if (!raw || typeof raw !== "object") return { ...defaults };
  const stored = raw as Partial<Record<keyof Settings, unknown>>;
  const fontFamily =
    typeof stored.editorFontFamily === "string" && stored.editorFontFamily.trim()
      ? stored.editorFontFamily
      : defaults.editorFontFamily;

  return {
    iconTheme:
      typeof stored.iconTheme === "string" && stored.iconTheme ? stored.iconTheme : defaults.iconTheme,
    sidebarVisible: bool(stored.sidebarVisible, defaults.sidebarVisible),
    sidebarWidth: clamp(
      stored.sidebarWidth,
      defaults.sidebarWidth,
      SIDEBAR_WIDTH_RANGE.min,
      SIDEBAR_WIDTH_RANGE.max,
    ),
    terminalVisible: bool(stored.terminalVisible, defaults.terminalVisible),
    layoutMode: oneOf(stored.layoutMode, LAYOUT_MODES, defaults.layoutMode),
    editorFontFamily: fontFamily,
    editorFontSize: clamp(
      stored.editorFontSize,
      defaults.editorFontSize,
      EDITOR_FONT_SIZE_RANGE.min,
      EDITOR_FONT_SIZE_RANGE.max,
    ),
    editorWordWrap: bool(stored.editorWordWrap, defaults.editorWordWrap),
    editorMinimap: bool(stored.editorMinimap, defaults.editorMinimap),
    editorLineNumbers: oneOf(stored.editorLineNumbers, LINE_NUMBER_MODES, defaults.editorLineNumbers),
    explorerCompactFolders: bool(stored.explorerCompactFolders, defaults.explorerCompactFolders),
    explorerAutoReveal: bool(stored.explorerAutoReveal, defaults.explorerAutoReveal),
    explorerGitDecorations: bool(stored.explorerGitDecorations, defaults.explorerGitDecorations),
    explorerOpenEditors: bool(stored.explorerOpenEditors, defaults.explorerOpenEditors),
    explorerOpenEditorsExpanded: bool(
      stored.explorerOpenEditorsExpanded,
      defaults.explorerOpenEditorsExpanded,
    ),
    scmViewSwitcher: oneOf(stored.scmViewSwitcher, SCM_VIEW_SWITCHERS, defaults.scmViewSwitcher),
    scmDefaultView: oneOf(stored.scmDefaultView, SCM_VIEWS, defaults.scmDefaultView),
  };
}

const store = createStore<Settings>({ key: "aether:settings", defaults: DEFAULTS, hydrate });

export const getSettings = store.get;
export const setSetting = store.setKey;
export const useSetting = store.useKey;

export const SETTINGS_DEFAULTS: Settings = DEFAULTS;

export const SETTINGS_SECTIONS: {
  id: SettingsSection;
  label: string;
  description: string;
}[] = [
  {
    id: "appearance",
    label: "Appearance",
    description: "Set the editor font, gutter, and how the workbench is arranged.",
  },
  {
    id: "explorer",
    label: "Explorer",
    description: "How the file tree presents your workspace, and what it surfaces alongside it.",
  },
  {
    id: "source-control",
    label: "Source Control",
    description: "How the Source Control panel switches between Changes, History, and Agent Review.",
  },
];

export function settingsSectionMeta(section: SettingsSection) {
  return SETTINGS_SECTIONS.find((s) => s.id === section) ?? SETTINGS_SECTIONS[0];
}

export function toggleSetting(
  key: { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings],
): void {
  setSetting(key, !store.get()[key] as never);
}
