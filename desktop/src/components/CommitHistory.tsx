import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CommitDot, CommitVertical, CommitDiagRight, CommitDiagLeft, CommitDash } from "../icons";
import type { CommitHistoryProps } from "../types";

const LINE_COLORS = [
  "text-sky-400",
  "text-emerald-400",
  "text-amber-400",
  "text-violet-400",
  "text-rose-400",
  "text-cyan-400",
  "text-lime-400",
  "text-fuchsia-400",
];

export default function CommitHistory({ rootPath }: CommitHistoryProps) {
  const [graph, setGraph] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const g = await invoke<string>("git_log_graph", { root: rootPath });
        if (!cancelled) setGraph(g);
      } catch {
        if (!cancelled) setGraph("");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [rootPath]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-zinc-600">
        Loading…
      </div>
    );
  }

  if (!graph.trim()) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-zinc-600">
        No commits found.
      </div>
    );
  }

  const lines = graph.split("\n").filter(Boolean);

  return (
    <div className="scroll-thin max-h-full overflow-y-auto py-1">
      {lines.map((line, i) => (
        <GraphLine key={i} line={line} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single line renderer
// ---------------------------------------------------------------------------

function GraphLine({ line }: { line: string }) {
  // Split graph prefix from commit text.
  // The prefix contains only: * | / \ - space
  // The commit text starts after the last graph char sequence.
  let graphEnd = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if ("*|/\\- ".includes(ch)) {
      graphEnd = i + 1;
    } else {
      break;
    }
  }

  const prefix = line.slice(0, graphEnd);
  const text = line.slice(graphEnd).trim();

  // Build an array of graph segments with colors.
  const segments: { char: string; color: string }[] = [];
  let colorIdx = 0;
  const branchColors = new Map<number, number>();

  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i];
    if (ch === " ") {
      segments.push({ char: " ", color: "" });
      continue;
    }
    // Assign a stable color per column for connecting lines.
    if (!branchColors.has(i)) {
      branchColors.set(i, colorIdx++ % LINE_COLORS.length);
    }
    const ci = branchColors.get(i)!;
    segments.push({ char: ch, color: LINE_COLORS[ci] });
  }

  return (
    <div className="flex items-center gap-1 px-2 py-[2px] text-xs hover:bg-white/[0.03]">
      <span className="flex shrink-0 font-mono text-[11px] leading-5">
        {segments.map((s, j) => {
          if (s.char === " ") return <span key={j} className="inline-block w-[10px]" />;
          if (s.char === "*")
            return (
              <span key={j} className={`inline-flex w-[10px] items-center justify-center ${s.color}`}>
                <span className="text-current"><CommitDot /></span>
              </span>
            );
          if (s.char === "|")
            return (
              <span key={j} className={`inline-flex w-[10px] items-center justify-center ${s.color}`}>
                <span className="text-current opacity-60"><CommitVertical /></span>
              </span>
            );
          if (s.char === "/")
            return (
              <span key={j} className={`inline-flex w-[10px] items-center justify-center ${s.color}`}>
                <span className="text-current opacity-60"><CommitDiagRight /></span>
              </span>
            );
          if (s.char === "\\")
            return (
              <span key={j} className={`inline-flex w-[10px] items-center justify-center ${s.color}`}>
                <span className="text-current opacity-60"><CommitDiagLeft /></span>
              </span>
            );
          if (s.char === "-")
            return (
              <span key={j} className={`inline-flex w-[10px] items-center justify-center ${s.color}`}>
                <span className="text-current opacity-60"><CommitDash /></span>
              </span>
            );
          return <span key={j} className="inline-block w-[10px]" />;
        })}
      </span>
      <span className="min-w-0 truncate text-zinc-400">
        <CommitText text={text} />
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commit text with highlighted refs
// ---------------------------------------------------------------------------

function CommitText({ text }: { text: string }) {
  if (!text) return null;

  // Format: "1a2b3c4 (HEAD -> main, tag: v1.0) Commit message"
  const hashMatch = text.match(/^([a-f0-9]+)\s*/);
  const hash = hashMatch?.[1] ?? "";
  const rest = text.slice(hash.length).trim();

  // Extract refs in parens
  const refsMatch = rest.match(/^\((.+?)\)\s*/);
  const refs = refsMatch?.[1] ?? "";
  const message = refsMatch ? rest.slice(refsMatch[0].length) : rest;

  return (
    <>
      {hash && <span className="font-mono text-zinc-600">{hash} </span>}
      {refs && (
        <span className="mr-1">
          {refs.split(", ").map((ref, i) => (
            <RefBadge key={i} refStr={ref} />
          ))}
        </span>
      )}
      <span className="text-zinc-300">{message}</span>
    </>
  );
}

function RefBadge({ refStr }: { refStr: string }) {
  const isHead = refStr.includes("HEAD");
  const isTag = refStr.startsWith("tag: ");
  const label = isTag ? refStr.slice(5) : refStr.replace(/^HEAD\s*->\s*/, "");
  const color = isHead
    ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
    : isTag
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
      : "bg-sky-500/15 text-sky-300 border-sky-500/25";
  return (
    <span className={`mr-1 rounded border px-1 py-[1px] text-[10px] font-medium ${color}`}>
      {label}
    </span>
  );
}
