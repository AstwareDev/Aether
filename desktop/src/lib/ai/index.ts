import { CHAT_SYSTEM } from "./prompts";
import { buildRequest, stream } from "./transport";
import type { CompletionOptions } from "../../types";

export * from "./providers";
export * from "./store";
export * from "./tasks";
export * from "./tools";
export * from "./transport";
export * from "./agent";
export * from "./review";
export * from "./commit";
export * from "./prompts";

export type {
  Effort,
  ModelInfo,
  ProviderConfig,
  ProviderTemplate,
  ResolvedTask,
  ReviewIssue,
  TaskAssignment,
  TaskId,
  ToolCall,
  ToolDefinition,
  ToolResult,
  Wire,
} from "../../types";

export async function runCompletion({
  system,
  messages,
  onToken,
  task = "chat",
  model,
  maxTokens,
  signal,
}: CompletionOptions): Promise<string> {
  const request = buildRequest(task, system || CHAT_SYSTEM, messages, undefined, { model, maxTokens });
  const { text } = await stream(request, { onToken, signal });
  return text;
}
