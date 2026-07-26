import type { ModelInfo, ProviderConfig, ProviderTemplate, Wire } from "../../types";

export const OMNIROUTE_ID = "omniroute";
export const OPENCODE_ZEN_ID = "opencode-zen";
export const ANTHROPIC_ID = "anthropic";
export const LM_STUDIO_ID = "lm-studio";

const OMNIROUTE_MODELS: ModelInfo[] = [
  { id: "kr/claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "kr/claude-sonnet-5", label: "Claude Sonnet 5" },
  { id: "kr/claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "kr/glm-5", label: "GLM 5" },
];

const OPENCODE_ZEN_MODELS: ModelInfo[] = [
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { id: "claude-opus-5", label: "Claude Opus 5" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "gpt-5.5", label: "GPT-5.5" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "grok-4.5", label: "Grok 4.5" },
  { id: "glm-5.2", label: "GLM 5.2" },
  { id: "glm-5", label: "GLM 5" },
  { id: "kimi-k2.7-code", label: "Kimi K2.7 Code" },
  { id: "minimax-m3", label: "MiniMax M3" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { id: "qwen3.7-plus", label: "Qwen 3.7 Plus" },
  { id: "big-pickle", label: "Big Pickle (free)" },
];

const ANTHROPIC_MODELS: ModelInfo[] = [
  { id: "claude-opus-5", label: "Claude Opus 5" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
];

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    id: OMNIROUTE_ID,
    label: "Omniroute",
    description: "Local Omniroute proxy exposing an OpenAI-compatible gateway.",
    wire: "openai",
    defaultBaseUrl: import.meta.env.VITE_OMNIROUTE_BASE_URL ?? "http://localhost:20218/v1",
    requiresApiKey: true,
    supportsModelListing: true,
    keyPlaceholder: "sk-…",
    catalog: OMNIROUTE_MODELS,
  },
  {
    id: OPENCODE_ZEN_ID,
    label: "OpenCode Zen",
    description: "Curated coding models from the OpenCode team. Key from opencode.ai/auth.",
    wire: "openai",
    defaultBaseUrl: "https://opencode.ai/zen/v1",
    requiresApiKey: true,
    supportsModelListing: true,
    keyPlaceholder: "sk-…",
    catalog: OPENCODE_ZEN_MODELS,
  },
  {
    id: ANTHROPIC_ID,
    label: "Anthropic",
    description: "Direct Anthropic Messages API.",
    wire: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    requiresApiKey: true,
    supportsModelListing: true,
    keyPlaceholder: "sk-ant-…",
    catalog: ANTHROPIC_MODELS,
  },
  {
    id: LM_STUDIO_ID,
    label: "LM Studio",
    description: "Local models served by LM Studio. No API key required.",
    wire: "openai",
    defaultBaseUrl: "http://localhost:1234",
    requiresApiKey: false,
    supportsModelListing: true,
    keyPlaceholder: "",
    catalog: [],
  },
];

export const CUSTOM_TEMPLATES: { wire: Wire; label: string; description: string; defaultBaseUrl: string }[] = [
  {
    wire: "anthropic",
    label: "Anthropic-compatible",
    description: "Any endpoint speaking the Anthropic /v1/messages protocol.",
    defaultBaseUrl: "https://",
  },
  {
    wire: "openai",
    label: "OpenAI-compatible",
    description: "Any endpoint speaking /v1/chat/completions.",
    defaultBaseUrl: "https://",
  },
];

export function templateFor(id: string | null): ProviderTemplate | undefined {
  return id ? PROVIDER_TEMPLATES.find((t) => t.id === id) : undefined;
}

export function configFromTemplate(template: ProviderTemplate): ProviderConfig {
  return {
    id: template.id,
    templateId: template.id,
    label: template.label,
    wire: template.wire,
    baseUrl: template.defaultBaseUrl,
    apiKey: template.id === OMNIROUTE_ID ? (import.meta.env.VITE_OMNIROUTE_API_KEY ?? "") : "",
    models: [],
    enabled: true,
  };
}

export function defaultProviders(): ProviderConfig[] {
  return PROVIDER_TEMPLATES.map(configFromTemplate);
}

/** `taken` is every existing provider id: a length-based counter would collide after
 *  a remove-then-add (5 → add #6 → add #7 → remove #6 → add would reuse #7). */
export function createCustomProvider(wire: Wire, taken: string[]): ProviderConfig {
  const preset = CUSTOM_TEMPLATES.find((c) => c.wire === wire) ?? CUSTOM_TEMPLATES[0];
  const used = new Set(taken);
  let n = 1;
  while (used.has(`custom-${wire}-${n}`)) n++;

  return {
    id: `custom-${wire}-${n}`,
    templateId: null,
    label: preset.label,
    wire,
    baseUrl: "",
    apiKey: "",
    models: [],
    enabled: true,
  };
}

/** Catalog entries plus any model IDs the user added or fetched, de-duplicated. */
export function modelsFor(provider: ProviderConfig): ModelInfo[] {
  const catalog = templateFor(provider.templateId)?.catalog ?? [];
  const seen = new Set(catalog.map((m) => m.id));
  const extra = provider.models.filter((id) => id && !seen.has(id)).map((id) => ({ id, label: id }));
  return [...catalog, ...extra];
}

export function modelLabel(provider: ProviderConfig | undefined, modelId: string): string {
  if (!provider) return modelId;
  return modelsFor(provider).find((m) => m.id === modelId)?.label ?? modelId;
}

/** Whether a missing key should block the provider. Custom endpoints are never
 *  blocked — a self-hosted gateway may legitimately need no auth. */
export function providerRequiresKey(provider: ProviderConfig): boolean {
  return templateFor(provider.templateId)?.requiresApiKey ?? false;
}

/** Whether to offer a key field at all. Custom endpoints always may supply one. */
export function providerAcceptsKey(provider: ProviderConfig): boolean {
  const template = templateFor(provider.templateId);
  return template ? template.requiresApiKey : true;
}

export function isProviderReady(provider: ProviderConfig | undefined): boolean {
  if (!provider || !provider.enabled) return false;
  if (!provider.baseUrl.trim()) return false;
  if (providerRequiresKey(provider) && !provider.apiKey.trim()) return false;
  return true;
}

export function supportsModelListing(provider: ProviderConfig): boolean {
  return templateFor(provider.templateId)?.supportsModelListing ?? true;
}
