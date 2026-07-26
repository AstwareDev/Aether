import {
  CODING_TOOLS,
  TOOL_LABELS,
  resetAiConfig,
  setAgentLimit,
  setToolEnabled,
  useAiConfig,
} from "../../lib/ai";
import { Field, SectionHeader, Toggle } from "./primitives";

export default function ToolsSection() {
  const config = useAiConfig();
  const disabled = new Set(config.disabledTools);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <SectionHeader
          title="AI Tools"
          description="Tools the inline agent may call while it gathers context. Every path is resolved inside the workspace root."
        />
        <div className="space-y-2">
          {CODING_TOOLS.map((tool) => (
            <div key={tool.name} className="flex items-start gap-3 rounded-lg border border-white/[0.08] px-4 py-3">
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-zinc-200">
                  {TOOL_LABELS[tool.name] ?? tool.name}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] text-zinc-600">{tool.name}</span>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{tool.description}</p>
              </div>
              <Toggle
                checked={!disabled.has(tool.name)}
                onChange={(enabled) => setToolEnabled(tool.name, enabled)}
                label={`Enable ${tool.name}`}
              />
            </div>
          ))}
        </div>
        {disabled.size === CODING_TOOLS.length && (
          <p className="text-[11px] text-amber-400/90">
            All tools are off — the agent answers from the prompt context alone.
          </p>
        )}
      </div>

      <div className="space-y-4">
        <SectionHeader title="Agent limits" description="How much work a single inline agent run may do." />

        <Field
          label={`Tool-call rounds: ${config.maxAgentSteps}`}
          hint="How many times the agent may call tools before it must answer."
        >
          <input
            type="range"
            min={1}
            max={20}
            value={config.maxAgentSteps}
            onChange={(e) => setAgentLimit("maxAgentSteps", Number(e.target.value))}
            className="w-full"
          />
        </Field>

        <Field
          label={`Imported files in context: ${config.relatedFileBudget}`}
          hint="Files reachable one import hop from the current file, inlined before the agent starts."
        >
          <input
            type="range"
            min={0}
            max={10}
            value={config.relatedFileBudget}
            onChange={(e) => setAgentLimit("relatedFileBudget", Number(e.target.value))}
            className="w-full"
          />
        </Field>
      </div>

      <div className="border-t border-white/[0.06] pt-4">
        <button
          type="button"
          onClick={() => {
            if (confirm("Reset every provider, route, and tool setting to defaults?")) resetAiConfig();
          }}
          className="rounded-lg border border-red-500/25 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
        >
          Reset AI settings
        </button>
        <p className="mt-2 text-[11px] text-zinc-500">Clears saved API keys, providers, and routing.</p>
      </div>
    </div>
  );
}
