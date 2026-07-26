import { useState } from "react";
import { motion } from "motion/react";
import {
  CUSTOM_TEMPLATES,
  addProvider,
  createCustomProvider,
  isProviderReady,
  listProviderModels,
  modelsFor,
  providerAcceptsKey,
  removeProvider,
  supportsModelListing,
  templateFor,
  updateProvider,
  useAiConfig,
} from "../../lib/ai";
import {
  Field,
  SectionHeader,
  StatusDot,
  Toggle,
  buttonClass,
  inputClass,
  monoInputClass,
} from "./primitives";
import type { ProviderConfig, Wire } from "../../types";

type Probe = { state: "idle" | "loading" | "ok" | "error"; message: string };

export default function ProvidersSection() {
  const config = useAiConfig();
  const [probes, setProbes] = useState<Record<string, Probe>>({});

  const setProbe = (id: string, probe: Probe) => setProbes((prev) => ({ ...prev, [id]: probe }));

  const fetchModels = async (provider: ProviderConfig) => {
    setProbe(provider.id, { state: "loading", message: "" });
    try {
      const fetched = await listProviderModels(provider.baseUrl, provider.wire, provider.apiKey);
      if (fetched.length === 0) {
        setProbe(provider.id, { state: "error", message: "Connected, but the endpoint listed no models." });
        return;
      }
      // Union, not replace: a hand-entered id must survive a fetch taken while that
      // model happens to be unloaded, or the routes pointing at it break.
      const merged = [...new Set([...provider.models, ...fetched])];
      updateProvider(provider.id, { models: merged });
      const added = merged.length - provider.models.length;
      setProbe(provider.id, {
        state: "ok",
        message: `${fetched.length} reported · ${added} new.`,
      });
    } catch (err) {
      setProbe(provider.id, { state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const addCustom = (wire: Wire) => {
    addProvider(createCustomProvider(wire, config.providers.map((p) => p.id)));
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Models & Providers"
        description="Connect a gateway or a local server. Every AI flow picks a provider from this list."
      />

      <div className="space-y-3">
        {config.providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            probe={probes[provider.id]}
            onFetchModels={() => fetchModels(provider)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
        <span className="text-xs text-zinc-500">Add a provider:</span>
        {CUSTOM_TEMPLATES.map((preset) => (
          <button
            key={preset.wire}
            type="button"
            onClick={() => addCustom(preset.wire)}
            title={preset.description}
            className={buttonClass}
          >
            + {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  probe,
  onFetchModels,
}: {
  provider: ProviderConfig;
  probe?: Probe;
  onFetchModels: () => void;
}) {
  const [open, setOpen] = useState(false);
  const template = templateFor(provider.templateId);
  const isCustom = provider.templateId === null;
  const ready = isProviderReady(provider);
  const models = modelsFor(provider);
  const acceptsKey = providerAcceptsKey(provider);

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08]">
      <div className="flex items-center gap-3 px-4 py-3">
        <StatusDot ok={ready} title={ready ? "Ready" : "Needs configuration"} />
        <button type="button" onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-medium text-zinc-200">{provider.label}</span>
          <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
            {template?.description ?? `${provider.wire === "anthropic" ? "Anthropic" : "OpenAI"}-compatible · ${provider.baseUrl || "no base URL"}`}
          </span>
        </button>
        <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
          {provider.wire}
        </span>
        <span className="shrink-0 text-[11px] text-zinc-500">{models.length} models</span>
        <Toggle
          checked={provider.enabled}
          onChange={(enabled) => updateProvider(provider.id, { enabled })}
          label={`Enable ${provider.label}`}
        />
      </div>

      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.15 }}
          className="space-y-3 border-t border-white/[0.06] bg-white/[0.015] px-4 py-4"
        >
          {isCustom && (
            <Field label="Name">
              <input
                value={provider.label}
                spellCheck={false}
                onChange={(e) => updateProvider(provider.id, { label: e.target.value })}
                className={inputClass}
              />
            </Field>
          )}

          <Field
            label="Base URL"
            hint={
              provider.wire === "anthropic"
                ? "Requests go to <base>/v1/messages."
                : "Requests go to <base>/v1/chat/completions."
            }
          >
            <input
              value={provider.baseUrl}
              spellCheck={false}
              placeholder={template?.defaultBaseUrl ?? "https://"}
              onChange={(e) => updateProvider(provider.id, { baseUrl: e.target.value })}
              className={monoInputClass}
            />
          </Field>

          {acceptsKey && (
            <Field label="API key" hint="Stored locally and sent only from the Rust backend.">
              <input
                type="password"
                value={provider.apiKey}
                spellCheck={false}
                placeholder={template?.keyPlaceholder || "sk-…"}
                onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })}
                className={monoInputClass}
              />
            </Field>
          )}

          <Field
            label="Models"
            hint="One model ID per line. Fetching merges whatever the endpoint reports."
          >
            <textarea
              value={provider.models.join("\n")}
              spellCheck={false}
              rows={Math.min(8, Math.max(3, provider.models.length + 1))}
              placeholder={template?.catalog.length ? "Built-in catalog is used when empty" : "model-id"}
              onChange={(e) =>
                updateProvider(provider.id, {
                  models: e.target.value
                    .split("\n")
                    .map((m) => m.trim())
                    .filter(Boolean),
                })
              }
              className={`${monoInputClass} resize-y`}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            {supportsModelListing(provider) && (
              <button
                type="button"
                onClick={onFetchModels}
                disabled={probe?.state === "loading" || !provider.baseUrl.trim()}
                className={buttonClass}
              >
                {probe?.state === "loading" ? "Fetching…" : "Fetch models"}
              </button>
            )}
            {isCustom && (
              <button
                type="button"
                onClick={() => removeProvider(provider.id)}
                className="shrink-0 rounded-lg border border-red-500/25 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
              >
                Remove
              </button>
            )}
            {probe && probe.state !== "loading" && probe.message && (
              <span className={`text-[11px] ${probe.state === "ok" ? "text-emerald-400" : "text-red-400"}`}>
                {probe.message}
              </span>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
