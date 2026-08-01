import { useId } from "react";
import {
  CODING_TOOLS,
  TOOL_LABELS,
  resetAiConfig,
  setAgentLimit,
  setToolEnabled,
  useAiConfig,
} from "../../lib/ai";
import { ConfirmAction, Group, LiveMessage, SettingRow, Slider, Toggle } from "./primitives";

export default function ToolsSection() {
  const config = useAiConfig();
  const disabled = new Set(config.disabledTools);
  const stepsId = useId();
  const filesId = useId();

  return (
    <div className="space-y-9">
      <Group
        label="Tools"
        footnote="Every path a tool touches is resolved inside the workspace root."
      >
        {CODING_TOOLS.map((tool) => (
          <SettingRow
            key={tool.name}
            label={TOOL_LABELS[tool.name] ?? tool.name}
            detail={tool.name}
            description={tool.description}
            control={
              <Toggle
                checked={!disabled.has(tool.name)}
                onChange={(enabled) => setToolEnabled(tool.name, enabled)}
                label={`Enable ${TOOL_LABELS[tool.name] ?? tool.name}`}
              />
            }
          />
        ))}
        {disabled.size === CODING_TOOLS.length && (
          <LiveMessage tone="warn">
            All tools are off — the agent answers from the prompt context alone.
          </LiveMessage>
        )}
      </Group>

      <Group label="Agent limits">
        <SettingRow
          label="Tool-call rounds"
          description="How many times the agent may call tools before it must answer."
          htmlFor={stepsId}
        >
          <Slider
            id={stepsId}
            value={config.maxAgentSteps}
            min={1}
            max={20}
            onChange={(value) => setAgentLimit("maxAgentSteps", value)}
            label="Tool-call rounds"
          />
        </SettingRow>

        <SettingRow
          label="Imported files in context"
          description="Files reachable one import hop from the current file, inlined before the agent starts."
          htmlFor={filesId}
        >
          <Slider
            id={filesId}
            value={config.relatedFileBudget}
            min={0}
            max={10}
            onChange={(value) => setAgentLimit("relatedFileBudget", value)}
            label="Imported files in context"
          />
        </SettingRow>
      </Group>

      <Group label="Reset" footnote="Clears saved API keys, providers, routing, and tool choices.">
        <ConfirmAction
          label="Reset AI settings"
          question="Reset every provider, route, and tool setting?"
          confirmLabel="Reset"
          onConfirm={resetAiConfig}
        />
      </Group>
    </div>
  );
}
