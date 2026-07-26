import { invoke, Channel } from "@tauri-apps/api/core";
import { resolveTask, taskSetupMessage } from "./tasks";
import { isProviderReady } from "./providers";
import type {
  AiEvent,
  ChatMessage,
  Effort,
  ResolvedTask,
  TaskId,
  ReasoningBlock,
  ToolCall,
  ToolDefinition,
} from "../../types";

export interface RequestPayload {
  provider: "anthropic" | "openai";
  baseUrl?: string;
  apiKey?: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  effort: Effort;
  tools?: ToolDefinition[];
}

export interface RequestOverrides {
  model?: string;
  maxTokens?: number;
  effort?: Effort;
}

export function buildRequest(
  task: TaskId,
  system: string,
  messages: ChatMessage[],
  tools?: ToolDefinition[],
  overrides: RequestOverrides = {},
): RequestPayload {
  const resolved = resolveTask(task);
  // Fail with the actionable setup message rather than letting the provider answer 401.
  if (!resolved || !isProviderReady(resolved.provider)) throw new Error(taskSetupMessage(task));
  return payloadFor(resolved, system, messages, tools, overrides);
}

export function payloadFor(
  resolved: ResolvedTask,
  system: string,
  messages: ChatMessage[],
  tools?: ToolDefinition[],
  overrides: RequestOverrides = {},
): RequestPayload {
  return {
    provider: resolved.provider.wire,
    baseUrl: resolved.provider.baseUrl,
    apiKey: resolved.provider.apiKey || undefined,
    model: overrides.model ?? resolved.model,
    system,
    messages,
    maxTokens: overrides.maxTokens ?? resolved.maxTokens,
    effort: overrides.effort ?? resolved.effort,
    tools,
  };
}

export interface StreamHandlers {
  onToken?: (text: string) => void;
  onReasoning?: (text: string) => void;
  signal?: AbortSignal;
}

export interface StreamResult {
  text: string;
  toolCalls: ToolCall[];
  thinking: ReasoningBlock[];
}

export async function stream(request: RequestPayload, handlers: StreamHandlers = {}): Promise<StreamResult> {
  const { onToken, onReasoning, signal } = handlers;
  let text = "";
  const toolCalls: ToolCall[] = [];
  const thinking: ReasoningBlock[] = [];
  let failure: string | null = null;

  const channel = new Channel<AiEvent>();
  channel.onmessage = (event) => {
    if (signal?.aborted) return;
    if (event.type === "delta") {
      text += event.text;
      onToken?.(event.text);
    } else if (event.type === "reasoning") {
      onReasoning?.(event.text);
    } else if (event.type === "thinking_block") {
      thinking.push({ type: "thinking", thinking: event.thinking, signature: event.signature });
    } else if (event.type === "redacted_thinking_block") {
      thinking.push({ type: "redacted_thinking", data: event.data });
    } else if (event.type === "tool_use") {
      toolCalls.push({ id: event.id, name: event.name, input: event.input });
    } else if (event.type === "error") {
      failure = event.message;
    }
  };

  await invoke("ai_complete", { request, onEvent: channel });
  if (failure) throw new Error(failure);
  return { text, toolCalls, thinking };
}

export async function listProviderModels(
  baseUrl: string,
  wire: "anthropic" | "openai",
  apiKey?: string,
): Promise<string[]> {
  return invoke<string[]>("ai_list_models", { baseUrl, wire, apiKey: apiKey || null });
}
