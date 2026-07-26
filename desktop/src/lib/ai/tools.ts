import { getAiConfig } from "./store";
import type { ToolDefinition } from "../../types";

export const CODING_TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description:
      "Read a file from the workspace. Returns line-numbered content. Use start_line/end_line to page through large files instead of reading them whole.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the workspace root." },
        start_line: { type: "number", description: "First line to read (1-indexed)." },
        end_line: { type: "number", description: "Last line to read (1-indexed, inclusive)." },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "list_directory",
    description:
      "List the entries of a directory. Directories are suffixed with '/'. Use this to orient yourself before guessing paths.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory relative to the workspace root. Defaults to the root." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "search_code",
    description:
      "Regex search across workspace files (respects .gitignore). Returns 'path:line: text' matches. Best tool for finding where a symbol is defined or used.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Rust-flavoured regular expression." },
        path: { type: "string", description: "Subdirectory to limit the search to." },
        glob: { type: "string", description: "Filename filter, e.g. '*.ts'." },
        ignore_case: { type: "boolean", description: "Case-insensitive match." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "find_files",
    description: "Find files by filename glob, e.g. '*.config.ts'. Use when you know the name but not the location.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Filename glob supporting * and ?." },
        path: { type: "string", description: "Subdirectory to limit the search to." },
      },
      required: ["pattern"],
      additionalProperties: false,
    },
  },
];

export const TOOL_LABELS: Record<string, string> = {
  read_file: "Read file",
  list_directory: "List directory",
  search_code: "Search code",
  find_files: "Find files",
};

export function enabledTools(): ToolDefinition[] {
  const disabled = new Set(getAiConfig().disabledTools);
  return CODING_TOOLS.filter((tool) => !disabled.has(tool.name));
}

/** Human-readable label for the tool the agent is currently running. */
export function describeToolCall(name: string, input: Record<string, unknown>): string {
  const arg = (key: string) => (typeof input[key] === "string" ? (input[key] as string) : "");
  switch (name) {
    case "read_file":
      return `Reading ${arg("path")}`;
    case "list_directory":
      return `Listing ${arg("path") || "workspace root"}`;
    case "search_code":
      return `Searching for ${arg("query")}`;
    case "find_files":
      return `Finding ${arg("pattern")}`;
    default:
      return `Running ${name}`;
  }
}
