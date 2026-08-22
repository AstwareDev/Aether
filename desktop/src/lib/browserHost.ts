import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "./fs";
import type {
  BrowserNavState,
  BrowserPaneUi,
  BrowserRecent,
  BrowserSignal,
  BrowserViewBounds,
} from "../types";

/**
 * Drives the native child webviews that back the browser pane. Each pane is a
 * real webview parented to the main window and positioned over a placeholder
 * element, so pages that refuse to be framed still work.
 */

const SIGNAL_EVENT = "browser://signal";

/** Matches `VIEW_PREFIX` in src-tauri/src/browser.rs. */
const VIEW_PREFIX = "aether-browser-";

const labels = new Map<string, string>();
let labelSeq = 0;

/** Stable webview label for a tab, so a pane survives switching tabs. */
export function viewLabelFor(key: string): string {
  let label = labels.get(key);
  if (!label) {
    label = `${VIEW_PREFIX}${++labelSeq}`;
    labels.set(key, label);
  }
  return label;
}

/** Tears down the native view behind a tab and releases its label. */
export function destroyBrowserView(key: string): void {
  const label = labels.get(key);
  if (!label) return;
  labels.delete(key);
  handlers.delete(label);
  navStates.delete(label);
  paneUi.delete(label);
  if (isTauri) void closeBrowserView(label).catch(() => {});
}

// ── navigation state ──────────────────────────────────────────────────

/**
 * A pane's webview outlives the React component that shows it — switching tabs
 * unmounts the component but leaves the page loaded. History has to live out
 * here too, or the address bar and the back button would reset every time.
 */
const navStates = new Map<string, BrowserNavState>();

export function isNewView(label: string): boolean {
  return !navStates.has(label);
}

export function navStateFor(label: string, initialUrl: string): BrowserNavState {
  let state = navStates.get(label);
  if (!state) {
    state = { stack: [initialUrl], cursor: 0 };
    navStates.set(label, state);
  }
  return state;
}

/**
 * Pane chrome that has to outlive the component for the same reason history
 * does — the inspector webview really does stay open while the tab is in the
 * background.
 */
const paneUi = new Map<string, BrowserPaneUi>();

export function paneUiFor(label: string): BrowserPaneUi {
  let ui = paneUi.get(label);
  if (!ui) {
    ui = { devtoolsOpen: false, devtoolsWidth: 420 };
    paneUi.set(label, ui);
  }
  return ui;
}

// ── signal fan-out ────────────────────────────────────────────────────

type Handler = (events: BrowserSignal[]) => void;

const handlers = new Map<string, Set<Handler>>();
let subscribed = false;

function ensureSubscribed(): void {
  if (subscribed || !isTauri) return;
  subscribed = true;
  void listen<{ label: string; events: BrowserSignal[] }>(SIGNAL_EVENT, (event) => {
    const { label, events } = event.payload;
    const set = handlers.get(label);
    if (!set || !Array.isArray(events)) return;
    for (const handler of set) handler(events);
  });
}

/** Subscribes to probe traffic from one pane. Payloads come from remote pages, so treat them as untrusted. */
export function onBrowserSignal(label: string, handler: Handler): () => void {
  ensureSubscribed();
  let set = handlers.get(label);
  if (!set) {
    set = new Set();
    handlers.set(label, set);
  }
  set.add(handler);
  return () => {
    set.delete(handler);
    if (!set.size) handlers.delete(label);
  };
}

// ── commands ──────────────────────────────────────────────────────────

export async function attachBrowserView(
  label: string,
  url: string,
  bounds: BrowserViewBounds,
): Promise<void> {
  return invoke("browser_attach", { label, url, ...bounds });
}

export async function setBrowserViewBounds(label: string, bounds: BrowserViewBounds): Promise<void> {
  return invoke("browser_set_bounds", { label, ...bounds });
}

export async function setBrowserViewVisible(label: string, visible: boolean): Promise<void> {
  return invoke("browser_set_visible", { label, visible });
}

export async function navigateBrowserView(label: string, url: string): Promise<void> {
  return invoke("browser_navigate", { label, url });
}

/** Follows `history.go`: -1 back, 1 forward, 0 reload. */
export async function browserViewHistory(label: string, delta: number): Promise<void> {
  return invoke("browser_history", { label, delta });
}

export async function evalInBrowserView(label: string, script: string): Promise<void> {
  return invoke("browser_eval", { label, script });
}

export async function closeBrowserView(label: string): Promise<void> {
  return invoke("browser_close", { label });
}

/** Matches `INSPECTOR_PREFIX` in src-tauri/src/browser.rs. */
const INSPECTOR_PREFIX = "aether-browser-dt-";

/**
 * The inspector for a pane is a webview like any other, so it is positioned,
 * shown and hidden through the same commands as the page it inspects.
 */
export function inspectorLabelFor(label: string): string {
  return `${INSPECTOR_PREFIX}${label.slice(VIEW_PREFIX.length)}`;
}

/**
 * Opens the real DevTools front-end inside a webview of our own, pointed at
 * this pane's page. Resolves to false when no debuggable page was found.
 */
export async function openBrowserInspector(
  label: string,
  bounds: BrowserViewBounds,
): Promise<boolean> {
  return invoke<boolean>("browser_inspector_open", { label, ...bounds });
}

export async function closeBrowserInspector(label: string): Promise<void> {
  return invoke("browser_inspector_close", { label });
}

/**
 * Copies through the OS clipboard rather than `navigator.clipboard`.
 *
 * Picking an element means clicking inside the browser's child webview, which
 * takes focus away from the app's own webview — and the clipboard API refuses
 * to write from a document that is not focused. Falls back to the web API where
 * there is no native path.
 */
export async function copyText(text: string): Promise<void> {
  if (isTauri) {
    try {
      await invoke("browser_copy_text", { text });
      return;
    } catch {
      /* fall through to the web API */
    }
  }
  await navigator.clipboard.writeText(text);
}

export async function clearBrowserViewData(label: string): Promise<void> {
  return invoke("browser_clear_data", { label });
}

export interface UrlCheck {
  reachable: boolean;
  status: number;
  error: string;
}

/** Asks whether a URL answers at all, so a pane can show its own failure state. */
export async function checkUrl(url: string): Promise<UrlCheck> {
  return invoke<UrlCheck>("browser_check_url", { url });
}

// ── recently visited ──────────────────────────────────────────────────
// Session-scoped, shared by every pane so a new tab has something to offer.

const recents: BrowserRecent[] = [];

export function rememberVisit(entry: BrowserRecent): void {
  const at = recents.findIndex((r) => r.url === entry.url);
  if (at >= 0) recents.splice(at, 1);
  recents.unshift(entry);
  if (recents.length > 8) recents.length = 8;
}

export function recentVisits(): BrowserRecent[] {
  return recents.slice();
}

// ── element picker ────────────────────────────────────────────────────
// The probe exposes this entry point on the page; `eval` has no return
// channel, so the picked element comes back as a signal.

export function setBrowserPicker(label: string, on: boolean): Promise<void> {
  return evalInBrowserView(
    label,
    `window.__aetherInspect && window.__aetherInspect(${on ? "true" : "false"});`,
  ).catch(() => {});
}
