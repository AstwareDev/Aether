import { invoke, Channel } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import type { AiSettings, AiEvent, CompletionOptions } from "../types";
export type { Brain, ReasoningEffort } from "../types";

export const CLAUDE_MODELS: { id: string; label: string }[] = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
];

export const MERCURY_MODEL = "mercury-2";

export const EFFORT_LEVELS: { id: string; label: string; icon: string }[] = [
  { id: "instant", label: "Instant", icon: "zap" },
  { id: "low", label: "Low", icon: "arrow-right" },
  { id: "medium", label: "Medium", icon: "arrow-bounce" },
  { id: "high", label: "High", icon: "radar" },
];

const DEFAULTS: AiSettings = {
  brain: "mercury",
  claudeModel: "claude-opus-4-8",
  apiKey: "",
  lmStudioBaseUrl: "http://localhost:1234",
  lmStudioModel: "",
  maxTokens: 4096,
  reasoningEffort: "medium",
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
  }
  emit();
}

export function subscribeAiSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAiSettings(): AiSettings {
  return useSyncExternalStore(subscribeAiSettings, getAiSettings, () => DEFAULTS);
}

export function activeBrainLabel(s: AiSettings = state): string {
  if (s.brain === "mercury") {
    return "Mercury 2";
  }
  if (s.brain === "claude") {
    return CLAUDE_MODELS.find((m) => m.id === s.claudeModel)?.label ?? s.claudeModel;
  }
  return s.lmStudioModel ? `LM Studio · ${s.lmStudioModel}` : "LM Studio";
}

export function isBrainReady(s: AiSettings = state): boolean {
  if (s.brain === "mercury") return true;
  return s.brain === "claude" ? s.apiKey.trim().length > 0 : s.lmStudioModel.trim().length > 0;
}

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
          reasoningEffort: s.reasoningEffort,
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

export async function listLmStudioModels(baseUrl: string): Promise<string[]> {
  return invoke<string[]>("ai_list_models", { baseUrl });
}

const EDIT_SELECTION_BASE =
  "You are a highly knowledgeable, detail-oriented programming assistant. The user provides a FILE section (compact line-numbered context around their cursor) and a SELECTED CODE section (the exact code to modify). Focus on the SELECTED CODE when making changes — the FILE context is for reference only. Keep responses clear, concise, and context-aware. Insert code at given points, preserving indentation. Avoid unnecessary explanations or imports. Output only what is required.";

const QUICK_QUESTION_BASE =
  "You are an intelligent programmer. A colleague is writing code and has a quick question. They provide a FILE section (compact line-numbered context around their cursor) and a SELECTED CODE section (the exact code they're asking about). Focus on the SELECTED CODE when answering — the FILE context is for reference. Provide a concise, direct answer with clear reasoning. Use Markdown syntax — always tag fenced code blocks with a language (e.g. ```ts) when the content is code. Only answer what is asked—nothing more.";

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
