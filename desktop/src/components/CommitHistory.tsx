import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "motion/react";
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

interface GitCommit {
  hash: string;
  short_hash: string;
  author: string;
  date: string;
  message: string;
  refs: string;
}

export default function CommitHistory({ rootPath }: CommitHistoryProps) {
  const [graph, setGraph] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [commits, setCommits] = useState<GitCommit[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [g, commitList] = await Promise.all([
          invoke<string>("git_log_graph", { root: rootPath }),
          invoke<GitCommit[]>("git_log", { root: rootPath }),
        ]);
        if (!cancelled) {
          setGraph(g);
          setCommits(commitList);
        }
      } catch {
        if (!cancelled) {
          setGraph("");
          setCommits([]);
        }
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
      {lines.map((line, i) => {
        // Match commit by short hash from graph line to detailed commit data
        const commit = commits.find(c => line.includes(c.short_hash));
        return <GraphLine key={i} line={line} commit={commit} />;
      })}
    </div>
  );
}

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return "just now";
    if (diffMins === 1) return "1 minute ago";
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours === 1) return "1 hour ago";
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return "1 day ago";
    if (diffDays < 7) return `${diffDays} days ago`;

    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks === 1) return "1 week ago";
    if (diffWeeks < 4) return `${diffWeeks} weeks ago`;

    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths === 1) return "1 month ago";
    if (diffMonths < 12) return `${diffMonths} months ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined
    });
  } catch {
    return isoDate;
  }
}

function formatFullDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    }) + " at " + date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  } catch {
    return isoDate;
  }
}

// Extract name and email from author string
function parseAuthor(author: string): { name: string; email: string } {
  const match = author.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { name: author, email: "" };
}

// Generate avatar initials from author name
function getInitials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// Generate a color from email for avatar
function getAvatarColor(email: string): string {
  const colors = [
    "bg-sky-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-violet-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-lime-500",
    "bg-fuchsia-500",
    "bg-orange-500",
    "bg-pink-500",
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// ---------------------------------------------------------------------------
// Single line renderer
// ---------------------------------------------------------------------------

function GraphLine({ line, commit }: { line: string; commit?: GitCommit }) {
  const [isHovered, setIsHovered] = useState(false);
  const [cardPosition, setCardPosition] = useState({ x: 0, y: 0 });
  const lineRef = useState<HTMLDivElement | null>(null)[0];

  // Split graph prefix from commit text
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

  // Build graph segments with colors
  const segments: { char: string; color: string }[] = [];
  let colorIdx = 0;
  const branchColors = new Map<number, number>();

  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i];
    if (ch === " ") {
      segments.push({ char: " ", color: "" });
      continue;
    }
    if (!branchColors.has(i)) {
      branchColors.set(i, colorIdx++ % LINE_COLORS.length);
    }
    const ci = branchColors.get(i)!;
    segments.push({ char: ch, color: LINE_COLORS[ci] });
  }

  const hasCommit = prefix.includes("*");

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hasCommit || !commit) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setCardPosition({ x: rect.right + 12, y: rect.top });
    setIsHovered(true);
  };

  const author = parseAuthor(commit?.author || "");
  const initials = getInitials(author.name);
  const avatarColor = getAvatarColor(author.email);

  return (
    <>
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsHovered(false)}
        className={`group relative flex items-center gap-1 px-2 py-[3px] text-xs transition-all ${
          hasCommit && isHovered ? "bg-white/[0.08] scale-[1.01]" : "hover:bg-white/[0.03]"
        }`}
      >
        <span className="flex shrink-0 font-mono text-[11px] leading-5">
          {segments.map((s, j) => {
            if (s.char === " ") return <span key={j} className="inline-block w-[10px]" />;
            if (s.char === "*")
              return (
                <motion.span
                  key={j}
                  className={`inline-flex w-[10px] items-center justify-center ${s.color}`}
                  initial={false}
                  animate={{
                    scale: hasCommit && isHovered ? 1.3 : 1,
                    filter: hasCommit && isHovered ? "drop-shadow(0 0 4px currentColor)" : "none",
                  }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <span className="text-current"><CommitDot /></span>
                </motion.span>
              );
            if (s.char === "|")
              return (
                <span key={j} className={`inline-flex w-[10px] items-center justify-center ${s.color}`}>
                  <motion.span
                    className="text-current"
                    initial={false}
                    animate={{ opacity: isHovered ? 0.8 : 0.6 }}
                    transition={{ duration: 0.2 }}
                  >
                    <CommitVertical />
                  </motion.span>
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
        <span className="min-w-0 flex-1 truncate text-zinc-400 transition-colors group-hover:text-zinc-300">
          <CommitText text={text} />
        </span>
      </div>

      {/* Hover card - portal outside sidebar */}
      <AnimatePresence>
        {hasCommit && isHovered && commit && (
          <motion.div
            initial={{ opacity: 0, x: -8, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{
              position: "fixed",
              left: cardPosition.x,
              top: cardPosition.y,
              zIndex: 9999,
            }}
            className="pointer-events-auto min-w-[480px] max-w-[520px] rounded-xl border border-white/[0.1] bg-[#1a1a1c]/98 shadow-2xl backdrop-blur-lg"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {/* Header with avatar and author */}
            <div className="flex items-start gap-3 border-b border-white/[0.08] p-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${avatarColor} text-[15px] font-semibold text-white shadow-lg`}>
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-zinc-200">{author.name}</span>
                  <span className="text-[11px] text-zinc-500">
                    {formatDate(commit.date)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-500">{formatFullDate(commit.date)}</p>
              </div>
            </div>

            {/* Commit message */}
            <div className="p-4">
              <p className="text-[14px] leading-relaxed text-zinc-200">
                {commit.message}
              </p>
            </div>

            {/* Stats placeholder */}
            <div className="border-t border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2 text-[12px]">
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <svg className="h-4 w-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>88 files changed</span>
                </div>
                <span className="text-zinc-600">·</span>
                <span className="text-emerald-400">20866 insertions(+)</span>
                <span className="text-zinc-600">·</span>
                <span className="text-red-400">1609 deletions(-)</span>
              </div>
            </div>

            {/* Refs/tags */}
            {commit.refs && (
              <div className="border-t border-white/[0.06] px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {commit.refs.split(", ").map((ref, i) => (
                    <RefBadge key={i} refStr={ref} />
                  ))}
                </div>
              </div>
            )}

            {/* Footer with hash and actions */}
            <div className="flex items-center gap-2 border-t border-white/[0.06] px-4 py-2.5">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(commit.hash)}
                className="group/hash flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-mono text-zinc-400 transition-all hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-zinc-200"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {commit.short_hash}
              </button>

              <div className="flex-1" />

              <button
                type="button"
                className="rounded-md px-2.5 py-1 text-[11px] text-sky-400 transition-colors hover:bg-sky-500/10"
              >
                Open on GitHub
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
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
