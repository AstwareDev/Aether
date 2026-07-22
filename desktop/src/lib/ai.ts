import { invoke, Channel } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import type { AiSettings, AiEvent, CompletionOptions } from "../types";
export type { Brain } from "../types";

// ---------------------------------------------------------------------------
// Settings — which "brain" powers the inline AI editor, plus its credentials.
// Persisted to localStorage. The API key lives on-device only; all network
// calls are made from Rust (see src-tauri/src/ai.rs), never from the webview.
// ---------------------------------------------------------------------------

export const CLAUDE_MODELS: { id: string; label: string }[] = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
];

export const MERCURY_MODEL = "mercury-2";

const DEFAULTS: AiSettings = {
  brain: "mercury",
  claudeModel: "claude-opus-4-8",
  apiKey: "",
  lmStudioBaseUrl: "http://localhost:1234",
  lmStudioModel: "",
  maxTokens: 4096,
};

const STORAGE_KEY = "aether:ai";

function load(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

let state: AiSettings = load();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getAiSettings(): AiSettings {
  return state;
}

export function setAiSetting<K extends keyof AiSettings>(key: K, value: AiSettings[K]): void {
  if (state[key] === value) return;
  state = { ...state, [key]: value };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — keep in-memory */
  }
  emit();
}

export function subscribeAiSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook: subscribe a component to the whole AI settings object. */
export function useAiSettings(): AiSettings {
  return useSyncExternalStore(subscribeAiSettings, getAiSettings, () => DEFAULTS);
}

/** Human label for the active brain + model, e.g. "Mercury 2". */
export function activeBrainLabel(s: AiSettings = state): string {
  if (s.brain === "mercury") {
    return "Mercury 2";
  }
  if (s.brain === "claude") {
    return CLAUDE_MODELS.find((m) => m.id === s.claudeModel)?.label ?? s.claudeModel;
  }
  return s.lmStudioModel ? `LM Studio · ${s.lmStudioModel}` : "LM Studio";
}

/** True when the active brain has enough config to run a request. */
export function isBrainReady(s: AiSettings = state): boolean {
  if (s.brain === "mercury") return true; // playground endpoint — no key needed
  return s.brain === "claude" ? s.apiKey.trim().length > 0 : s.lmStudioModel.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Completion bridge
// ---------------------------------------------------------------------------



/**
 * Stream a completion from the active brain. Resolves when the stream ends,
 * rejects with an Error on failure. Tokens arrive via `onToken`/`onReplace`.
 */
export async function runCompletion({
  system,
  messages,
  onToken,
  onReplace,
}: CompletionOptions): Promise<void> {
  const s = getAiSettings();

  const channel = new Channel<AiEvent>();
  channel.onmessage = (event) => {
    if (event.type === "delta") onToken(event.text);
    else if (event.type === "replace") onReplace?.(event.text);
  };

  const request =
    s.brain === "mercury"
      ? {
          provider: "mercury",
          model: MERCURY_MODEL,
          system,
          messages,
          maxTokens: s.maxTokens,
        }
      : s.brain === "claude"
        ? {
            provider: "anthropic",
            apiKey: s.apiKey,
            model: s.claudeModel,
            system,
            messages,
            maxTokens: s.maxTokens,
          }
        : {
            provider: "openai",
            baseUrl: s.lmStudioBaseUrl,
            model: s.lmStudioModel,
            system,
            messages,
            maxTokens: s.maxTokens,
          };

  try {
    await invoke("ai_complete", { request, onEvent: channel });
  } catch (err) {
    throw new Error(typeof err === "string" ? err : String(err));
  }
}

/** List models exposed by an LM Studio / OpenAI-compatible server. */
export async function listLmStudioModels(baseUrl: string): Promise<string[]> {
  return invoke<string[]>("ai_list_models", { baseUrl });
}

// ---------------------------------------------------------------------------
// Prompts (adapted from Cursor's inline-agent system prompts)
// ---------------------------------------------------------------------------

const EDIT_SELECTION_BASE =
  "You are a highly knowledgeable, detail-oriented programming assistant. Keep responses clear, concise, and context-aware. Analyze code critically, follow instructions precisely, and consider code formatting and surroundings. Insert code at given points, preserving indentation. Avoid unnecessary explanations or imports. Output only what is required.";

const QUICK_QUESTION_BASE =
  "You are an intelligent programmer. A colleague is writing code in a file, and has a quick question. Provide a concise, direct answer with clear reasoning. Use Markdown syntax — always tag fenced code blocks with a language (e.g. ```ts) when the content is code. Only answer what is asked—nothing more.";

/**
 * Build a system prompt for the given mode, computed fresh per call (not a
 * frozen constant) so it always reflects the current date — this matters for
 * a long-running app session that can cross midnight.
 */
export function buildSystemPrompt(mode: "edit" | "question"): string {
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
  const base = mode === "edit" ? EDIT_SELECTION_BASE : QUICK_QUESTION_BASE;
  return `${base}\n\nToday's date is ${today}.`;
}
