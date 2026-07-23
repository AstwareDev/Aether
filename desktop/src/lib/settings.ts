import { useSyncExternalStore } from "react";
import type { Settings } from "../types";

const DEFAULTS: Settings = {
  iconTheme: "aether",
  sidebarVisible: true,
  sidebarWidth: 256,
  terminalVisible: false,
  layoutMode: "aether",
};

const STORAGE_KEY = "aether:settings";

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

let state: Settings = load();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSettings(): Settings {
  return state;
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  if (state[key] === value) return;
  state = { ...state, [key]: value };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
  }
  emit();
}

export function toggleSetting(key: { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]): void {
  setSetting(key, !state[key] as never);
}

export function useSetting<K extends keyof Settings>(key: K): Settings[K] {
  return useSyncExternalStore(
    subscribe,
    () => state[key],
    () => DEFAULTS[key],
  );
}
