import { REVIEW_SYSTEM } from "./prompts";
import { buildRequest, stream } from "./transport";
import type { ReviewIssue, ReviewSeverity } from "../../types";

const REVIEW_SEVERITIES: ReviewSeverity[] = ["bug", "security", "performance", "improvement"];

/**
 * Annotates each added/context line of a unified diff with its new-file line number,
 * so the reviewer can cite lines that map to the real file.
 */
export function annotateDiffWithLineNumbers(diff: string): string {
  const out: string[] = [];
  let newLine = 0;

  for (const line of diff.split("\n")) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      out.push(line);
      continue;
    }
    if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ") || line.startsWith("index ")) {
      out.push(line);
      continue;
    }
    if (line.startsWith("-")) {
      out.push(line);
      continue;
    }
    if (line.startsWith("+") || line.startsWith(" ")) {
      out.push(`${newLine} ${line}`);
      newLine++;
      continue;
    }
    out.push(line);
  }

  return out.join("\n");
}

function extractJsonArray(text: string): unknown[] | null {
  const start = text.indexOf("[");
  if (start === -1) return null;

  // Scan for the matching bracket rather than a greedy regex, so prose or a
  // second array after the payload doesn't corrupt the parse.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1));
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function normalizeIssue(raw: unknown, index: number, knownFiles: string[]): ReviewIssue | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!title) return null;

  const rawFile = typeof o.file === "string" ? o.file.replace(/\\/g, "/").trim() : "";
  const file =
    knownFiles.find((f) => f === rawFile) ??
    knownFiles.find((f) => f.endsWith(rawFile) || rawFile.endsWith(f)) ??
    rawFile;
  if (!file) return null;

  const lineValue = Number(o.line);
  const severity = REVIEW_SEVERITIES.includes(o.severity as ReviewSeverity)
    ? (o.severity as ReviewSeverity)
    : "improvement";

  return {
    id: `${file}:${Number.isFinite(lineValue) ? lineValue : 0}:${index}`,
    file,
    line: Number.isFinite(lineValue) && lineValue > 0 ? Math.floor(lineValue) : 1,
    title,
    description: typeof o.description === "string" ? o.description.trim() : "",
    severity,
    suggested_fix: typeof o.suggested_fix === "string" ? o.suggested_fix.trim() : undefined,
  };
}

export async function runReview(
  diffs: { file: string; diff: string }[],
  signal?: AbortSignal,
): Promise<ReviewIssue[]> {
  if (diffs.length === 0) return [];

  const body = diffs
    .map((d) => `=== FILE: ${d.file} ===\n${annotateDiffWithLineNumbers(d.diff)}`)
    .join("\n\n");

  const request = buildRequest("review", REVIEW_SYSTEM, [
    {
      role: "user",
      content:
        `Review the following ${diffs.length} changed file(s). ` +
        "Added and context lines are prefixed with their new-file line number.\n\n" +
        body,
    },
  ]);

  const { text } = await stream(request, { signal });

  const parsed = extractJsonArray(text);
  if (!parsed) return [];

  const knownFiles = diffs.map((d) => d.file);
  return parsed
    .map((raw, i) => normalizeIssue(raw, i, knownFiles))
    .filter((i): i is ReviewIssue => i !== null);
}
