import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "motion/react";
import { runCompletion, getAiSettings, isBrainReady } from "../lib/ai";
import { FileTypeIcon } from "../lib/icons";
import { baseName } from "../lib/fs";
import CommitHistory from "./CommitHistory";
import { RefreshSvg, BranchSvg, CheckSvg, SparkSvg, AgentSvg, QuestionSvg } from "../icons";
import type { GitFile, SourceControlProps } from "../types";

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

async function gitStatus(root: string): Promise<GitFile[]> {
  return invoke<GitFile[]>("git_status", { root });
}

async function gitDiff(root: string, filePath: string): Promise<string> {
  return invoke<string>("git_diff", { root, filePath });
}

async function gitStageAll(root: string): Promise<void> {
  return invoke("git_stage_all", { root });
}

async function gitCommit(root: string, message: string): Promise<void> {
  return invoke("git_commit", { root, message });
}

async function gitBranch(root: string): Promise<string> {
  return invoke<string>("git_branch", { root });
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function statusLabel(status: string): string {
  switch (status.toUpperCase()) {
    case "M": return "M";
    case "A": return "A";
    case "D": return "D";
    case "R": return "R";
    case "C": return "C";
    case "U": return "U";
    default: return "?";
  }
}

function statusColor(status: string): string {
  switch (status.toUpperCase()) {
    case "M": return "text-amber-400";
    case "A": return "text-emerald-400";
    case "D": return "text-red-400";
    case "R": return "text-sky-400";
    case "?": return "text-zinc-500";
    default: return "text-zinc-400";
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SourceControl({ rootPath, onOpenDiff }: SourceControlProps) {
  const [viewMode, setViewMode] = useState<"changes" | "history">("changes");
  const [files, setFiles] = useState<GitFile[]>([]);
  const [branch, setBranch] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statuses, branchName] = await Promise.all([
        gitStatus(rootPath),
        gitBranch(rootPath).catch(() => ""),
      ]);
      setFiles(statuses);
      setBranch(branchName);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [rootPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim() || files.length === 0) return;
    setCommitting(true);
    setError(null);
    try {
      await gitStageAll(rootPath);
      await gitCommit(rootPath, commitMsg.trim());
      setCommitMsg("");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setCommitting(false);
    }
  }, [commitMsg, files.length, rootPath, refresh]);

  const generateMessage = useCallback(async () => {
    if (files.length === 0) return;
    const settings = getAiSettings();
    if (!isBrainReady(settings)) {
      setError("Configure an AI model in AI Settings (Ctrl+Shift+P → AI: Settings) first.");
      return;
    }
    setGenerating(true);
    setError(null);
    setCommitMsg("");

    try {
      // Gather diffs for all changed files (cap at 8 000 chars total)
      const diffs: string[] = [];
      let total = 0;
      for (const f of files) {
        if (total > 8000) break;
        try {
          const d = await gitDiff(rootPath, f.path);
          if (d) {
            diffs.push(d);
            total += d.length;
          }
        } catch {
          // skip
        }
      }

      const diffText = diffs.join("\n---\n").slice(0, 8000);
      const fileList = files.map((f) => `${f.status} ${f.path}`).join("\n");

      await runCompletion({
        system:
          "You generate concise git commit messages. Output ONLY the commit message — no markdown, no explanation, no quotes. Use the imperative mood. Keep the subject line under 72 characters. If there are notable details, add a blank line then a short body.",
        messages: [
          {
            role: "user",
            content: `Generate a commit message for these changes:\n\nFiles:\n${fileList}\n\nDiff:\n${diffText}`,
          },
        ],
        onToken: (t) => setCommitMsg((prev) => prev + t),
        onReplace: (t) => setCommitMsg(t),
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  }, [files, rootPath]);

  const hasChanges = files.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* Header row */}
      <div className="group flex items-center justify-between px-2 pb-1">
        <span className="truncate pl-2 text-[11px] font-bold uppercase tracking-wide text-zinc-300">
          Source Control
        </span>
        <div className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            title="Refresh"
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-zinc-200 disabled:opacity-40"
          >
            <RefreshSvg spinning={loading} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="mx-3 mb-2 flex gap-0">
        <button
          type="button"
          onClick={() => setViewMode("changes")}
          className={`rounded-l-md border px-3 py-1 text-[11px] font-medium transition-colors ${
            viewMode === "changes"
              ? "border-accent/40 bg-accent/10 text-white"
              : "border-white/[0.08] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
          }`}
        >
          Changes
        </button>
        <button
          type="button"
          onClick={() => setViewMode("history")}
          className={`-ml-px rounded-r-md border px-3 py-1 text-[11px] font-medium transition-colors ${
            viewMode === "history"
              ? "border-accent/40 bg-accent/10 text-white"
              : "border-white/[0.08] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
          }`}
        >
          History
        </button>
      </div>

      {viewMode === "changes" ? (
        <>
          {/* Branch pill */}
          {branch && (
            <div className="mx-3 mb-2 flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.03] px-2.5 py-1">
              <BranchSvg />
              <span className="truncate text-[11px] text-zinc-400">{branch}</span>
            </div>
          )}

          {/* Commit message area */}
          <div className="mx-3 mb-1 flex flex-col gap-1">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder={generating ? "Generating…" : "Message (Ctrl+↵ to commit)"}
            rows={5}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void handleCommit();
              }
            }}
            className="scroll-thin w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 text-[12px] text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-accent/40 focus:bg-white/[0.06]"
          />
          {generating && (
            <span className="absolute right-2 top-2 h-2 w-2 animate-pulse rounded-full bg-accent" />
          )}
        </div>

        {/* Commit + AI buttons */}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleCommit}
            disabled={!commitMsg.trim() || !hasChanges || committing}
            className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md bg-accent/90 text-[12px] font-medium text-black transition-all hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {committing ? (
              "Committing…"
            ) : (
              <>
                <CheckSvg />
                Commit
              </>
            )}
          </button>

          <button
            type="button"
            onClick={generateMessage}
            disabled={!hasChanges || generating || committing}
            title="Generate commit message with AI"
            className="flex h-7 items-center justify-center gap-1 rounded-md border border-white/[0.1] px-2.5 text-[12px] text-zinc-300 transition-colors hover:border-accent/40 hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SparkSvg />
          </button>
        </div>
      </div>

      {/* Agent Review — disabled with tooltip */}
      <div className="mx-3 mb-2">
        <AgentReviewButton />
      </div>

      {/* Divider */}
      <div className="mx-3 mb-1 border-t border-white/[0.05]" />

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-3 mb-2 overflow-hidden rounded-md border border-red-500/20 bg-red-500/10 px-2.5 py-1.5"
          >
            <p className="text-[11px] leading-snug text-red-300">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Changes section */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {hasChanges ? (
          <>
            <p className="px-4 pb-1 text-[10px] uppercase tracking-wider text-zinc-600">
              Changes ({files.length})
            </p>
            <ul>
              {files.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => onOpenDiff?.(f.path)}
                    title="View diff"
                    className="group flex w-full items-center gap-1.5 px-4 py-[3px] text-left transition-colors text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  >
                    <span
                      className={`shrink-0 text-center text-[10px] font-bold ${statusColor(f.status)}`}
                    >
                      {statusLabel(f.status)}
                    </span>
                    <FileTypeIcon name={baseName(f.path)} size={14} />
                    <span className="min-w-0 flex-1 truncate text-[12px]">
                      {f.path}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : !loading ? (
          <p className="px-4 py-3 text-[12px] text-zinc-600">
            No changes detected.
          </p>
        ) : null}
      </div>
        </>
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <CommitHistory rootPath={rootPath} />
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Agent Review button (disabled, tooltip)
// ---------------------------------------------------------------------------

function AgentReviewButton() {
  const [show, setShow] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onTouchStart={() => setShow(true)}
      onTouchEnd={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      tabIndex={-1}
    >
      <button
        type="button"
        disabled
        className="flex h-7 w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-white/[0.12] text-[12px] text-zinc-500 opacity-60 bg-[#18181b]"
        aria-label="Agent Review — under development"
      >
        <AgentSvg />
        Agent Review
        <QuestionSvg />
   
      </button>

      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.14 }}
            className="pointer-events-none absolute top-full left-1/2 mt-0.5 -translate-x-1/2 whitespace-nowrap rounded border border-zinc-800 bg-[#111112] px-2.5 py-[2px] text-[11px] text-zinc-400 shadow-lg z-10"
          >
            Under development
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


