import {
  TASK_IDS,
  TASK_META,
  isProviderReady,
  modelsFor,
  resolveTask,
  updateAssignment,
  useAiConfig,
} from "../../lib/ai";
import { Select, SectionHeader, StatusDot } from "./primitives";
import type { AiConfig, Effort, TaskId } from "../../types";

const EFFORT_OPTIONS: { value: Effort; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export default function RoutingSection() {
  const config = useAiConfig();

  return (
    <div className="space-y-6">
      <SectionHeader
        title="AI Configuration"
        description="Route each flow to its own provider, model, and reasoning effort. Set Default once and let the rest inherit."
      />

      <div className="space-y-3">
        {TASK_IDS.map((task) => (
          <TaskRow key={task} task={task} config={config} />
        ))}
      </div>

      <p className="border-t border-white/[0.06] pt-4 text-[11px] leading-relaxed text-zinc-500">
        Reasoning effort maps to extended thinking on Anthropic-compatible providers and to
        <code className="mx-1 rounded bg-white/[0.06] px-1 py-0.5 font-mono">reasoning_effort</code>
        on OpenAI-compatible ones. Providers that don't support it ignore the setting.
      </p>
    </div>
  );
}

function TaskRow({ task, config }: { task: TaskId; config: AiConfig }) {
  const meta = TASK_META[task];
  const assignment = config.assignments[task];
  const isDefault = task === "default";
  const inherits = assignment.inherit && !isDefault;

  const resolved = resolveTask(task, config);
  const provider = config.providers.find((p) => p.id === assignment.providerId);
  const models = provider ? modelsFor(provider) : [];
  // resolveTask reads the `default` assignment when inheriting, so its model only
  // describes this row when both point at the same provider.
  const shownModel =
    resolved && resolved.provider.id === assignment.providerId ? resolved.model : assignment.model;

  const providerOptions = config.providers.map((p) => ({
    value: p.id,
    label: p.enabled ? p.label : `${p.label} (disabled)`,
  }));

  return (
    <div className="rounded-lg border border-white/[0.08] px-4 py-3">
      <div className="flex items-start gap-3">
        <StatusDot
          ok={resolved !== null && isProviderReady(resolved.provider)}
          title={resolved ? "Ready" : "Needs configuration"}
        />
        <div className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-zinc-200">{meta.label}</span>
          <span className="mt-0.5 block text-[11px] text-zinc-500">{meta.description}</span>
        </div>
        {!isDefault && (
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
            <input
              type="checkbox"
              checked={assignment.inherit}
              onChange={(e) => updateAssignment(task, { inherit: e.target.checked })}
              className="accent-[var(--color-accent)]"
            />
            Inherit default
          </label>
        )}
      </div>

      {inherits ? (
        <p className="mt-3 text-[11px] text-zinc-500">
          Using Default → <span className="text-zinc-400">{resolved ? `${resolved.provider.label} · ${resolved.model}` : "not configured"}</span>
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
          <div className="sm:col-span-1">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">Provider</span>
            <Select
              value={assignment.providerId}
              onChange={(providerId) => updateAssignment(task, { providerId, model: "" })}
              options={providerOptions}
            />
          </div>
          <div className="sm:col-span-1">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">Model</span>
            {/* Shows the resolved model, not the raw assignment: an unset or stale id
                resolves to the first available one, and the panel must not claim
                otherwise. */}
            <Select
              value={shownModel}
              onChange={(model) => updateAssignment(task, { model })}
              options={models.map((m) => ({ value: m.id, label: m.label }))}
              placeholder="No models configured"
            />
          </div>
          <div className="sm:col-span-1">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">Effort</span>
            <Select
              value={assignment.effort}
              onChange={(effort) => updateAssignment(task, { effort })}
              options={EFFORT_OPTIONS}
            />
          </div>
          <div className="sm:col-span-1">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">Max tokens</span>
            <input
              type="number"
              min={256}
              max={200000}
              step={256}
              value={assignment.maxTokens}
              onChange={(e) =>
                updateAssignment(task, { maxTokens: Math.max(256, Number(e.target.value) || 4096) })
              }
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 outline-none transition-colors hover:border-white/20 focus:border-accent/60"
            />
          </div>
        </div>
      )}
    </div>
  );
}
