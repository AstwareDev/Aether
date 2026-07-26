import { getAiConfig, TASK_META } from "./store";
import { isProviderReady, modelLabel, modelsFor, providerRequiresKey } from "./providers";
import type { AiConfig, ProviderConfig, ResolvedTask, TaskId } from "../../types";

function providerById(config: AiConfig, id: string): ProviderConfig | undefined {
  return config.providers.find((p) => p.id === id);
}

/**
 * Resolve a task to a concrete provider + model. An inheriting task reads `default`.
 * The provider is never silently swapped — a flow must run on the provider it was
 * assigned, so a misconfigured one surfaces via taskSetupMessage instead of quietly
 * billing a different endpoint. Only the model falls back, since provider model lists
 * are discovered at runtime.
 */
export function resolveTask(task: TaskId, config: AiConfig = getAiConfig()): ResolvedTask | null {
  const own = config.assignments[task];
  const effective = own.inherit && task !== "default" ? config.assignments.default : own;

  const provider = providerById(config, effective.providerId);
  if (!provider) return null;

  const available = modelsFor(provider);
  const model =
    effective.model && available.some((m) => m.id === effective.model)
      ? effective.model
      : (available[0]?.id ?? effective.model);
  if (!model) return null;

  return {
    provider,
    model,
    effort: effective.effort,
    maxTokens: effective.maxTokens,
  };
}

export function isTaskReady(task: TaskId, config: AiConfig = getAiConfig()): boolean {
  const resolved = resolveTask(task, config);
  return resolved !== null && isProviderReady(resolved.provider);
}

/** Message shown when a flow is invoked before its provider is usable. */
export function taskSetupMessage(task: TaskId, config: AiConfig = getAiConfig()): string {
  const own = config.assignments[task];
  const effective = own.inherit && task !== "default" ? config.assignments.default : own;
  const provider = providerById(config, effective.providerId);
  const name = provider?.label ?? effective.providerId;
  const label = TASK_META[task].label;

  if (!provider) return `${label} has no provider selected. Open Settings → Models & Providers.`;
  if (!provider.enabled) return `${name} is disabled. Enable it in Settings → Models & Providers.`;
  if (!provider.baseUrl.trim()) return `${name} needs a base URL. Open Settings → Models & Providers.`;
  if (providerRequiresKey(provider) && !provider.apiKey.trim()) {
    return `${name} needs an API key. Open Settings → Models & Providers.`;
  }
  if (modelsFor(provider).length === 0) {
    return `${name} has no models yet. Fetch or add one in Settings → Models & Providers.`;
  }
  return `${label} isn't configured. Open Settings → AI Configuration.`;
}

export function taskLabel(task: TaskId, config: AiConfig = getAiConfig()): string {
  const resolved = resolveTask(task, config);
  if (!resolved) return "Not configured";
  return `${resolved.provider.label} · ${modelLabel(resolved.provider, resolved.model)}`;
}

export function openAiSettings(): void {
  window.dispatchEvent(new CustomEvent("aether:open-ai-settings"));
}
