import { COMMIT_SYSTEM } from "./prompts";
import { buildRequest, stream } from "./transport";

const MAX_COMMIT_DIFF_CHARS = 60_000;

export async function generateCommitMessage(
  stagedDiff: string,
  files: { path: string; status: string }[],
  onToken?: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const truncated =
    stagedDiff.length > MAX_COMMIT_DIFF_CHARS
      ? `${stagedDiff.slice(0, MAX_COMMIT_DIFF_CHARS)}\n… diff truncated …`
      : stagedDiff;

  const fileList = files.map((f) => `${f.status}\t${f.path}`).join("\n");

  const request = buildRequest("commit", COMMIT_SYSTEM, [
    { role: "user", content: `Changed files:\n${fileList}\n\nFull staged diff:\n${truncated}` },
  ]);

  const { text } = await stream(request, { onToken, signal });
  return text.trim();
}
