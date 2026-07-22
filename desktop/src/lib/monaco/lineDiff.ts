import type { DiffHunk } from "../../types";
export type { DiffHunk } from "../../types";

/** Above this many lines on either side we stop doing O(n·m) LCS. */
const MAX_DIFF_LINES = 2000;

/**
 * Split into lines, dropping the phantom empty segment a trailing newline
 * produces — so "a\n" and "a" compare equal instead of diffing a ghost line.
 */
function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Compute the line diff between `original` and `proposed` as a list of hunks
 * in proposed-text order. Identical inputs produce no hunks.
 */
export function computeLineDiff(original: string, proposed: string): DiffHunk[] {
  if (original === proposed) return [];

  const a = splitLines(original);
  const b = splitLines(proposed);
  const n = a.length;
  const m = b.length;

  if (n > MAX_DIFF_LINES || m > MAX_DIFF_LINES) {
    return [{ proposedStartLine: 0, addedCount: m, removedLines: a }];
  }

  // dp[i*(m+1)+j] = LCS length of a[i..] and b[j..].
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }

  // Walk the table, grouping every maximal run of changes into one hunk.
  const hunks: DiffHunk[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    const hunk: DiffHunk = { proposedStartLine: j, addedCount: 0, removedLines: [] };
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) break;
      if (j < m && (i === n || dp[i * width + j + 1] >= dp[(i + 1) * width + j])) {
        hunk.addedCount++;
        j++;
      } else {
        hunk.removedLines.push(a[i]);
        i++;
      }
    }
    hunks.push(hunk);
  }
  return hunks;
}
