import { createStore } from "../store";
import {
  ANTHROPIC_ID,
  LM_STUDIO_ID,
  OMNIROUTE_ID,
  defaultProviders,
  templateFor,
} from "./providers";
import type { AiConfig, Effort, ProviderConfig, TaskAssignment, TaskId } from "../../types";

export const STORAGE_KEY = "aether:ai";

export const TASK_IDS: TaskId[] = ["default", "inline", "commit", "review", "chat"];

export const TASK_META: Record<TaskId, { label: string; description: string }> = {
  default: {
    label: "Default",
    description: "Fallback for every flow set to inherit.",
  },
  inline: {
    label: "Inline prompt bar",
    description: "The Ctrl+K editor agent that reads files and proposes edits.",
  },
  commit: {
    label: "Commit messages",
    description: "Generates a message from the staged diff in Source Control.",
  },
  review: {
    label: "Agent Review",
    description: "Reviews changed files and reports issues inline.",
  },
  chat: {
    label: "Chat",
    description: "The standalone AI window and general completions.",
  },
};

function assignment(overrides: Partial<TaskAssignment> = {}): TaskAssignment {
  return {
    inherit: true,
    providerId: OMNIROUTE_ID,
    model: "",
    effort: "off",
    maxTokens: 4096,
    ...overrides,
  };
}

export function defaultConfig(): AiConfig {
  return {
    providers: defaultProviders(),
    assignments: {
      default: assignment({ inherit: false, providerId: OMNIROUTE_ID, model: "kr/claude-haiku-4-5" }),
      inline: assignment({ inherit: false, providerId: OMNIROUTE_ID, model: "kr/claude-haiku-4-5", maxTokens: 8192 }),
      commit: assignment({ inherit: false, providerId: OMNIROUTE_ID, model: "kr/claude-haiku-4-5", maxTokens: 1024 }),
      review: assignment({ inherit: false, providerId: OMNIROUTE_ID, model: "kr/glm-5", effort: "medium", maxTokens: 8192 }),
      chat: assignment(),
    },
    disabledTools: [],
    maxAgentSteps: 8,
    relatedFileBudget: 3,
  };
}

interface LegacyState {
  brain?: string;
  claudeModel?: string;
  apiKey?: string;
  lmStudioBaseUrl?: string;
  lmStudioModel?: string;
  maxTokens?: number;
  reasoningEffort?: string;
  omnirouteBaseUrl?: string;
  omnirouteApiKey?: string;
  omnirouteModel?: string;
}

function legacyEffort(raw: string | undefined): Effort {
  return raw === "low" || raw === "medium" || raw === "high" ? raw : "off";
}

function isLegacy(raw: Record<string, unknown>): boolean {
  return !Array.isArray(raw.providers) && ("brain" in raw || "omnirouteApiKey" in raw || "apiKey" in raw);
}

/**
 * v1 stored one flat record with a three-way `brain` switch. Map those fields onto the
 * matching provider configs and pin the flows that used to be hardcoded constants, so an
 * existing install keeps working without being reconfigured.
 */
function migrateLegacy(raw: LegacyState): AiConfig {
  const config = defaultConfig();
  const maxTokens = typeof raw.maxTokens === "number" && raw.maxTokens >= 256 ? raw.maxTokens : 4096;

  const patch = (id: string, fields: Partial<ProviderConfig>) => {
    const index = config.providers.findIndex((p) => p.id === id);
    if (index !== -1) config.providers[index] = { ...config.providers[index], ...fields };
  };

  if (raw.omnirouteBaseUrl) patch(OMNIROUTE_ID, { baseUrl: raw.omnirouteBaseUrl });
  if (raw.omnirouteApiKey) patch(OMNIROUTE_ID, { apiKey: raw.omnirouteApiKey });
  if (raw.apiKey) patch(ANTHROPIC_ID, { apiKey: raw.apiKey });
  if (raw.lmStudioBaseUrl) patch(LM_STUDIO_ID, { baseUrl: raw.lmStudioBaseUrl });
  if (raw.lmStudioModel) patch(LM_STUDIO_ID, { models: [raw.lmStudioModel] });

  const brainProvider =
    raw.brain === "claude" ? ANTHROPIC_ID : raw.brain === "lm-studio" ? LM_STUDIO_ID : OMNIROUTE_ID;
  const brainModel =
    brainProvider === ANTHROPIC_ID
      ? (raw.claudeModel ?? "claude-opus-4-8")
      : brainProvider === LM_STUDIO_ID
        ? (raw.lmStudioModel ?? "")
        : (raw.omnirouteModel ?? "kr/claude-haiku-4-5");

  // The old model id may predate the shipped catalog. Register it so resolveTask keeps
  // it instead of falling back to the catalog's first entry, which can be far costlier.
  if (brainModel) {
    const index = config.providers.findIndex((p) => p.id === brainProvider);
    if (index !== -1) {
      const existing = config.providers[index];
      if (!existing.models.includes(brainModel)) {
        config.providers[index] = { ...existing, models: [...existing.models, brainModel] };
      }
    }
  }

  config.assignments.default = {
    inherit: false,
    providerId: brainProvider,
    model: brainModel,
    effort: legacyEffort(raw.reasoningEffort),
    maxTokens,
  };
  config.assignments.chat = { ...config.assignments.default };

  return config;
}

/**
 * Restores a provider record. `base` is the built-in template config when one exists, so
 * a stored record that predates a field (or was hand-edited) inherits that field rather
 * than being reset to empty — clearing `baseUrl` would strand the provider as unusable.
 */
function hydrateProvider(raw: unknown, base?: ProviderConfig): ProviderConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : base?.id;
  if (!id) return null;

  const templateId = typeof o.templateId === "string" ? o.templateId : (base?.templateId ?? null);
  const template = templateFor(templateId);
  const fallback = base ?? {
    label: template?.label ?? id,
    wire: template?.wire ?? ("openai" as const),
    baseUrl: template?.defaultBaseUrl ?? "",
    apiKey: "",
    models: [] as string[],
    enabled: true,
  };

  const str = (value: unknown, or: string) => (typeof value === "string" ? value : or);

  return {
    id,
    templateId,
    // Built-in identity stays owned by the template so a later rename propagates.
    label: template ? template.label : str(o.label, fallback.label) || id,
    wire: template ? template.wire : o.wire === "anthropic" || o.wire === "openai" ? o.wire : fallback.wire,
    baseUrl: str(o.baseUrl, fallback.baseUrl),
    apiKey: str(o.apiKey, fallback.apiKey),
    models: Array.isArray(o.models)
      ? o.models.filter((m): m is string => typeof m === "string")
      : fallback.models,
    enabled: typeof o.enabled === "boolean" ? o.enabled : fallback.enabled,
  };
}

function hydrateAssignment(raw: unknown, fallback: TaskAssignment): TaskAssignment {
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const effort = o.effort;
  return {
    inherit: typeof o.inherit === "boolean" ? o.inherit : fallback.inherit,
    providerId: typeof o.providerId === "string" ? o.providerId : fallback.providerId,
    model: typeof o.model === "string" ? o.model : fallback.model,
    effort:
      effort === "off" || effort === "low" || effort === "medium" || effort === "high" ? effort : fallback.effort,
    maxTokens:
      typeof o.maxTokens === "number" && o.maxTokens >= 256 ? Math.floor(o.maxTokens) : fallback.maxTokens,
  };
}

function hydrate(raw: unknown, defaults: AiConfig): AiConfig {
  if (!raw || typeof raw !== "object") return defaults;
  const o = raw as Record<string, unknown>;
  if (isLegacy(o)) return migrateLegacy(o as LegacyState);

  const rawProviders = Array.isArray(o.providers) ? o.providers : [];
  const rawById = new Map<string, unknown>();
  for (const raw of rawProviders) {
    const id = raw && typeof raw === "object" ? (raw as Record<string, unknown>).id : undefined;
    if (typeof id === "string") rawById.set(id, raw);
  }

  // Built-ins are always present so a newly shipped provider appears for existing users.
  const providers = defaults.providers.map((base) => {
    const raw = rawById.get(base.id);
    return raw ? (hydrateProvider(raw, base) ?? base) : base;
  });
  for (const raw of rawProviders) {
    const restored = hydrateProvider(raw);
    if (restored && !providers.some((p) => p.id === restored.id)) providers.push(restored);
  }

  const rawAssignments = (o.assignments ?? {}) as Record<string, unknown>;
  const assignments = {} as Record<TaskId, TaskAssignment>;
  for (const task of TASK_IDS) {
    assignments[task] = hydrateAssignment(rawAssignments[task], defaults.assignments[task]);
  }

  return {
    providers,
    assignments,
    disabledTools: Array.isArray(o.disabledTools)
      ? o.disabledTools.filter((t): t is string => typeof t === "string")
      : defaults.disabledTools,
    maxAgentSteps:
      typeof o.maxAgentSteps === "number" && o.maxAgentSteps >= 1
        ? Math.min(20, Math.floor(o.maxAgentSteps))
        : defaults.maxAgentSteps,
    relatedFileBudget:
      typeof o.relatedFileBudget === "number" && o.relatedFileBudget >= 0
        ? Math.min(10, Math.floor(o.relatedFileBudget))
        : defaults.relatedFileBudget,
  };
}

const store = createStore<AiConfig>({ key: STORAGE_KEY, defaults: defaultConfig(), hydrate });

export const getAiConfig = store.get;
export const useAiConfig = store.useStore;
export const subscribeAiConfig = store.subscribe;

export function updateProvider(id: string, patch: Partial<ProviderConfig>): void {
  const providers = getAiConfig().providers.map((p) => (p.id === id ? { ...p, ...patch } : p));
  store.set({ providers });
}

export function addProvider(provider: ProviderConfig): void {
  store.set({ providers: [...getAiConfig().providers, provider] });
}

export function removeProvider(id: string): void {
  const config = getAiConfig();
  const providers = config.providers.filter((p) => p.id !== id);
  if (providers.length === config.providers.length) return;

  const survivor = providers.find((p) => p.enabled)?.id ?? providers[0]?.id ?? "";
  const assignments = { ...config.assignments };
  for (const task of TASK_IDS) {
    if (assignments[task].providerId === id) {
      assignments[task] = { ...assignments[task], providerId: survivor, model: "" };
    }
  }
  store.set({ providers, assignments });
}

export function updateAssignment(task: TaskId, patch: Partial<TaskAssignment>): void {
  const config = getAiConfig();
  store.set({ assignments: { ...config.assignments, [task]: { ...config.assignments[task], ...patch } } });
}

export function setToolEnabled(name: string, enabled: boolean): void {
  const current = getAiConfig().disabledTools;
  const next = enabled ? current.filter((t) => t !== name) : current.includes(name) ? current : [...current, name];
  store.set({ disabledTools: next });
}

export function setAgentLimit<K extends "maxAgentSteps" | "relatedFileBudget">(key: K, value: number): void {
  store.setKey(key, Math.max(0, Math.floor(value)));
}

export function resetAiConfig(): void {
  store.replace(defaultConfig());
}
