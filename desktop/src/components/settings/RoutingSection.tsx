import { useId } from "react";
import {
  TASK_IDS,
  TASK_META,
  isProviderReady,
  modelsFor,
  resolveTask,
  updateAssignment,
  useAiConfig,
} from "../../lib/ai";
import {
  Field,
  Group,
  SegmentedControl,
  Select,
  StatusDot,
  Toggle,
  inputClass,
} from "./primitives";
import type { AiConfig, Effort, TaskId } from "../../types";

const EFFORT_OPTIONS: { value: Effort; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
];

export default function RoutingSection() {
  const config = useAiConfig();

  return (
    <div className="space-y-9">
      <Group
        label="Routes"
        footnote={
          <>
            Reasoning effort maps to extended thinking on Anthropic-compatible providers and to
            <code className="mx-1 rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11px]">
              reasoning_effort
            </code>
            on OpenAI-compatible ones. Providers that don't support it ignore the setting.
          </>
        }
      >
        {TASK_IDS.map((task) => (
          <TaskRow key={task} task={task} config={config} />
        ))}
      </Group>
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

  const providerId = useId();
  const modelId = useId();
  const tokensId = useId();
  const inheritId = useId();

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.012] px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="pt-[7px]">
          <StatusDot
            ok={resolved !== null && isProviderReady(resolved.provider)}
            label={resolved ? "Ready" : "Needs configuration"}
          />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-zinc-200">{meta.label}</span>
          <p className="mt-0.5 max-w-[58ch] text-[12px] leading-relaxed text-zinc-400">
            {meta.description}
          </p>
        </div>
        {!isDefault && (
          <div className="flex shrink-0 items-center gap-2">
            <label htmlFor={inheritId} className="text-[12px] text-zinc-400">
              Inherit
            </label>
            <Toggle
              id={inheritId}
              checked={assignment.inherit}
              onChange={(inherit) => updateAssignment(task, { inherit })}
              label={`Inherit default for ${meta.label}`}
            />
          </div>
        )}
      </div>

      {inherits ? (
        <p className="mt-3 text-[12px] text-zinc-400">
          Using Default —{" "}
          <span className="font-mono text-[11px] text-zinc-300">
            {resolved ? `${resolved.provider.label} · ${resolved.model}` : "not configured"}
          </span>
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 @md:grid-cols-2 @2xl:grid-cols-4">
          <Field label="Provider" htmlFor={providerId}>
            <Select
              id={providerId}
              value={assignment.providerId}
              onChange={(nextProvider) =>
                updateAssignment(task, { providerId: nextProvider, model: "" })
              }
              options={providerOptions}
            />
          </Field>
          <Field label="Model" htmlFor={modelId}>
            {/* Shows the resolved model, not the raw assignment: an unset or stale id
                resolves to the first available one, and the panel must not claim
                otherwise. */}
            <Select
              id={modelId}
              value={shownModel}
              onChange={(model) => updateAssignment(task, { model })}
              options={models.map((m) => ({ value: m.id, label: m.label }))}
              placeholder="No models configured"
            />
          </Field>
          <div>
            <span className="mb-1.5 block text-[12px] font-medium text-zinc-300">Effort</span>
            <SegmentedControl
              value={assignment.effort}
              onChange={(effort) => updateAssignment(task, { effort })}
              options={EFFORT_OPTIONS}
              label={`Reasoning effort for ${meta.label}`}
            />
          </div>
          <Field label="Max tokens" htmlFor={tokensId}>
            <input
              id={tokensId}
              type="number"
              min={256}
              max={200000}
              step={256}
              value={assignment.maxTokens}
              onChange={(e) =>
                updateAssignment(task, { maxTokens: Math.max(256, Number(e.target.value) || 4096) })
              }
              className={inputClass}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
