import { createStore } from "./store";
import type { Settings } from "../types";

const DEFAULTS: Settings = {
  iconTheme: "aether",
  sidebarVisible: true,
  sidebarWidth: 256,
  terminalVisible: false,
  layoutMode: "aether",
  editorFontFamily: "Consolas, 'Courier New', monospace",
  editorFontSize: 14,
};

const store = createStore<Settings>({ key: "aether:settings", defaults: DEFAULTS });

export const getSettings = store.get;
export const setSetting = store.setKey;
export const useSetting = store.useKey;

export function toggleSetting(
  key: { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings],
): void {
  setSetting(key, !store.get()[key] as never);
}
