import { execTool } from "../fs";
import { getAiConfig } from "./store";
import { enabledTools } from "./tools";
import { buildRequest, stream, type RequestOverrides } from "./transport";
import type { ChatMessage, ContentBlock, TaskId, ToolCall, ToolDefinition } from "../../types";

export interface AgentRunOptions {
  task: TaskId;
  system: string;
  messages: ChatMessage[];
  root: string;
  tools?: ToolDefinition[];
  overrides?: RequestOverrides;
  signal?: AbortSignal;
  /**
   * Fired before each provider round. Consumers that accumulate `onToken` output must
   * reset on this: text emitted alongside a tool call belongs to that step's narration,
   * not to the final answer, and edit mode applies the accumulated text to the buffer.
   */
  onStepStart?: (step: number) => void;
  onToken?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onToolCall?: (call: ToolCall) => void;
  onToolResult?: (call: ToolCall, output: string, isError: boolean) => void;
}

/**
 * Native tool-calling loop. Tool calls come back as structured `tool_use` blocks and
 * results are appended as `tool_result` blocks, so the provider sees a real tool
 * transcript rather than tool output flattened into prose.
 */
export async function runAgent({
  task,
  system,
  messages,
  root,
  tools,
  overrides,
  signal,
  onStepStart,
  onToken,
  onReasoning,
  onToolCall,
  onToolResult,
}: AgentRunOptions): Promise<string> {
  const active = tools ?? enabledTools();
  const budget = Math.max(1, getAiConfig().maxAgentSteps);
  const transcript: ChatMessage[] = [...messages];
  let finalText = "";
  let lastText = "";

  for (let step = 0; step < budget; step++) {
    if (signal?.aborted) break;
    onStepStart?.(step);

    const request = buildRequest(task, system, transcript, active.length ? active : undefined, overrides);
    const { text, toolCalls, thinking } = await stream(request, { onToken, onReasoning, signal });
    if (text.trim()) lastText = text;

    if (toolCalls.length === 0) {
      finalText = text;
      break;
    }

    // Anthropic rejects an assistant turn that carries tool_use with extended thinking
    // enabled unless the signed thinking blocks come back first, in order.
    const assistantBlocks: ContentBlock[] = [...thinking];
    if (text.trim()) assistantBlocks.push({ type: "text", text });
    for (const call of toolCalls) {
      assistantBlocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.input });
    }
    transcript.push({ role: "assistant", content: assistantBlocks });

    const resultBlocks: ContentBlock[] = [];
    for (const call of toolCalls) {
      onToolCall?.(call);
      let output: string;
      let isError = false;
      try {
        const result = await execTool(call.name, call.input, root);
        isError = Boolean(result.error);
        output = result.error ?? result.output;
      } catch (err) {
        isError = true;
        output = err instanceof Error ? err.message : String(err);
      }
      onToolResult?.(call, output, isError);
      resultBlocks.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: output || "(no output)",
        is_error: isError,
      });
    }
    transcript.push({ role: "user", content: resultBlocks });
  }

  // Hitting the step budget mid-tool-loop would otherwise return nothing;
  // fall back to the last prose the model produced.
  return finalText || lastText;
}
