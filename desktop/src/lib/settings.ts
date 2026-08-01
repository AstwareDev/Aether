import { createStore } from "./store";
import type { EditorLineNumbers, LayoutMode, Settings, SettingsSection } from "../types";

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
};

export const SIDEBAR_WIDTH_RANGE = { min: 180, max: 480 } as const;
export const EDITOR_FONT_SIZE_RANGE = { min: 10, max: 24 } as const;

const LAYOUT_MODES: LayoutMode[] = ["aether", "vscode", "compact"];
const LINE_NUMBER_MODES: EditorLineNumbers[] = ["on", "relative", "off"];

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
    id: "models",
    label: "Models & Providers",
    description: "Connect a gateway or a local server. Every AI flow picks a provider from this list.",
  },
  {
    id: "ai-tools",
    label: "AI Tools",
    description:
      "Choose what the inline agent may call while it gathers context, and how far a single run may go.",
  },
  {
    id: "ai-config",
    label: "AI Configuration",
    description:
      "Route each flow to its own provider, model, and reasoning effort. Set Default once and let the rest inherit.",
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
