import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "motion/react";
import { runReview, generateCommitMessage, isTaskReady, taskLabel, taskSetupMessage, openAiSettings, useAiConfig } from "../lib/ai";
import { FileTypeIcon } from "../lib/icons";
import { baseName } from "../lib/fs";
import CommitHistory from "./CommitHistory";
import { RefreshSvg, BranchSvg, CheckSvg, SparkSvg, AgentSvg } from "../icons";
import type { GitFile, ReviewIssue, ReviewSeverity, SourceControlProps } from "../types";

const MAX_REVIEW_DIFF_CHARS = 40_000;

const SEVERITY_LABEL: Record<ReviewSeverity, string> = {
  bug: "Bug",
  security: "Security",
  performance: "Performance",
  improvement: "Improvement",
};

function severityDot(severity: ReviewSeverity): string {
  switch (severity) {
    case "bug": return "bg-red-400";
    case "security": return "bg-orange-400";
    case "performance": return "bg-yellow-400";
    default: return "bg-accent";
  }
}

async function gitStatus(root: string): Promise<GitFile[]> {
  return invoke<GitFile[]>("git_status", { root });
}

async function gitDiff(root: string, filePath: string): Promise<string> {
  return invoke<string>("git_diff", { root, filePath });
}

async function gitDiffStaged(root: string): Promise<string> {
  return invoke<string>("git_diff_staged", { root });
}

async function gitStageAll(root: string): Promise<void> {
  return invoke("git_stage_all", { root });
}

async function gitCommit(root: string, message: string): Promise<void> {
  return invoke("git_commit", { root, message });
}

async function gitPush(root: string): Promise<void> {
  return invoke("git_push", { root });
}

async function gitPushSetUpstream(root: string, branch: string): Promise<void> {
  return invoke("git_push_set_upstream", { root, branch });
}

async function gitBranch(root: string): Promise<string> {
  return invoke<string>("git_branch", { root });
}

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

export default function SourceControl({ rootPath, onOpenDiff }: SourceControlProps) {
  const [viewMode, setViewMode] = useState<"changes" | "history" | "agent">("changes");
  const [files, setFiles] = useState<GitFile[]>([]);
  const [branch, setBranch] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: GitFile } | null>(null);
  const [commitDropdownOpen, setCommitDropdownOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [reviewing, setReviewing] = useState(false);
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);

  const aiConfig = useAiConfig();
  const reviewModelLabel = taskLabel("review", aiConfig);

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

  const handleCommit = useCallback(async (mode: "commit" | "commit-push" | "commit-push-upstream") => {
    if (!commitMsg.trim() || files.length === 0) return;
    setCommitting(true);
    setError(null);
    setCommitDropdownOpen(false);
    try {
      await gitStageAll(rootPath);
      await gitCommit(rootPath, commitMsg.trim());

      if (mode === "commit-push") {
        await gitPush(rootPath);
      } else if (mode === "commit-push-upstream") {
        await gitPushSetUpstream(rootPath, branch);
      }

      setCommitMsg("");
      setReviewIssues([]);
      setActiveIssueId(null);
      setDismissed(new Set());
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setCommitting(false);
    }
  }, [commitMsg, files.length, rootPath, branch, refresh]);

  const generateMessage = useCallback(async () => {
    if (files.length === 0) return;
    if (!isTaskReady("commit")) {
      setError(taskSetupMessage("commit"));
      openAiSettings();
      return;
    }
    setGenerating(true);
    setError(null);
    setCommitMsg("");

    try {
      // Staging first is what makes `git diff --cached` the whole changeset,
      // which is the context the message is supposed to summarize.
      await gitStageAll(rootPath);
      const stagedDiff = await gitDiffStaged(rootPath);
      if (!stagedDiff.trim()) {
        setError("Nothing staged to describe.");
        return;
      }
      const message = await generateCommitMessage(stagedDiff, files, (t) =>
        setCommitMsg((prev) => prev + t),
      );
      setCommitMsg(message);
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  }, [files, rootPath]);

  const runAgentReview = useCallback(async () => {
    if (files.length === 0) return;
    if (!isTaskReady("review")) {
      setReviewError(taskSetupMessage("review"));
      openAiSettings();
      return;
    }
    setReviewing(true);
    setReviewError(null);
    setReviewIssues([]);
    setDismissed(new Set());

    try {
      const settled = await Promise.all(
        files.map(async (f) => {
          try {
            const diff = await gitDiff(rootPath, f.path);
            return diff.trim() ? { file: f.path, diff } : null;
          } catch {
            return null;
          }
        }),
      );

      const diffs: { file: string; diff: string }[] = [];
      let total = 0;
      for (const entry of settled) {
        if (!entry) continue;
        if (total + entry.diff.length > MAX_REVIEW_DIFF_CHARS) continue;
        total += entry.diff.length;
        diffs.push(entry);
      }

      if (diffs.length === 0) {
        setReviewError("No diffs found to review.");
        return;
      }
      if (diffs.length < settled.filter(Boolean).length) {
        setReviewError(
          `Reviewed ${diffs.length} of ${settled.filter(Boolean).length} changed files — the rest exceeded the size budget.`,
        );
      }

      setReviewIssues(await runReview(diffs));
    } catch (e) {
      setReviewError(String(e));
    } finally {
      setReviewing(false);
    }
  }, [files, rootPath]);

  const handleRevertFile = useCallback(async (filePath: string) => {
    setError(null);
    try {
      await invoke("git_checkout_file", { root: rootPath, filePath });
      await refresh();
      setContextMenu(null);
    } catch (e) {
      setError(String(e));
    }
  }, [rootPath, refresh]);

  const hasChanges = files.length > 0;

  const visibleIssues = reviewIssues.filter((i) => !dismissed.has(i.id));

  const revealIssue = useCallback((issue: ReviewIssue) => {
    setActiveIssueId(issue.id);
    window.dispatchEvent(new CustomEvent("aether:reveal-review-issue", { detail: issue }));
  }, []);

  // The annotation card owns Dismiss once it is open, so mirror it back here.
  useEffect(() => {
    const onDismiss = (e: Event) => {
      const issue = (e as CustomEvent).detail as ReviewIssue | undefined;
      if (!issue) return;
      setDismissed((prev) => new Set(prev).add(issue.id));
      setActiveIssueId((current) => (current === issue.id ? null : current));
    };
    window.addEventListener("aether:dismiss-review-issue", onDismiss);
    return () => window.removeEventListener("aether:dismiss-review-issue", onDismiss);
  }, []);

  const issuesByFile = visibleIssues.reduce<Record<string, ReviewIssue[]>>((acc, issue) => {
    const key = issue.file || "(unknown)";
    (acc[key] ??= []).push(issue);
    return acc;
  }, {});

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex min-h-0 flex-1 flex-col"
    >
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

      <div className="mx-3 mb-2 flex gap-0">
        <button
          type="button"
          onClick={() => setViewMode("changes")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-l-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${
            viewMode === "changes"
              ? "border-accent/40 bg-accent/10 text-white"
              : "border-white/[0.08] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
          }`}
        >
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="truncate">Changes</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode("history")}
          className={`-ml-px flex flex-1 items-center justify-center gap-1.5 border px-2 py-1.5 text-[11px] font-medium transition-colors ${
            viewMode === "history"
              ? "border-accent/40 bg-accent/10 text-white"
              : "border-white/[0.08] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
          }`}
        >
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="truncate">History</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode("agent")}
          className={`-ml-px flex flex-1 items-center justify-center gap-1.5 rounded-r-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${
            viewMode === "agent"
              ? "border-accent/40 bg-accent/10 text-white"
              : "border-white/[0.08] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
          }`}
        >
          <AgentSvg />
          <span className="truncate">Agent Review</span>
        </button>
      </div>

      {viewMode === "changes" ? (
        <>
          {branch && (
            <div className="mx-3 mb-2 flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.03] px-2.5 py-1">
              <BranchSvg />
              <span className="truncate text-[11px] text-zinc-400">{branch}</span>
            </div>
          )}

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
                void handleCommit("commit");
              }
            }}
            className="scroll-thin w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 text-[12px] text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-accent/40 focus:bg-white/[0.06]"
          />
          {generating && (
            <span className="absolute right-2 top-2 h-2 w-2 animate-pulse rounded-full bg-accent" />
          )}
        </div>

        <div className="flex gap-1.5">
          <div className="relative flex flex-1">
            <button
              type="button"
              onClick={() => handleCommit("commit")}
              disabled={!commitMsg.trim() || !hasChanges || committing}
              className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-l-md bg-accent/90 text-[12px] font-medium text-black transition-all hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
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
              onClick={() => setCommitDropdownOpen(!commitDropdownOpen)}
              disabled={!commitMsg.trim() || !hasChanges || committing}
              className="flex h-7 w-6 items-center justify-center rounded-r-md border-l border-black/20 bg-accent/90 text-[12px] font-medium text-black transition-all hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <AnimatePresence>
              {commitDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onMouseDown={() => setCommitDropdownOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.08 }}
                    className="absolute left-0 top-full z-50 mt-1 w-[220px] overflow-hidden rounded-lg border border-white/[0.05] bg-[#0d0d0d] py-1 shadow-[0_8px_40px_rgba(0,0,0,0.85)]"
                  >
                    <button
                      type="button"
                      onClick={() => handleCommit("commit")}
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <span className="text-[12px] font-medium text-zinc-200">Commit</span>
                      <span className="text-[10px] text-zinc-500">Stage and commit changes</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCommit("commit-push")}
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <span className="text-[12px] font-medium text-zinc-200">Commit & Push</span>
                      <span className="text-[10px] text-zinc-500">Commit and push to remote</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCommit("commit-push-upstream")}
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <span className="text-[12px] font-medium text-zinc-200">Commit & Push (Set Upstream)</span>
                      <span className="text-[10px] text-zinc-500">Commit and set upstream origin</span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

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

      <div className="mx-3 mb-1 border-t border-white/[0.05]" />

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
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, file: f });
                    }}
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
      ) : viewMode === "history" ? (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <CommitHistory rootPath={rootPath} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mx-3 mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={runAgentReview}
              disabled={!hasChanges || reviewing}
              className="flex h-7 items-center justify-center gap-1.5 rounded-md bg-accent/90 px-3 text-[12px] font-medium text-black transition-all hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {reviewing ? (
                <>
                  <span className="h-2 w-2 animate-pulse rounded-full bg-black/40" />
                  Reviewing…
                </>
              ) : (
                <>
                  <AgentSvg />
                  Run Review
                </>
              )}
            </button>
            {visibleIssues.length > 0 && (
              <span className="text-[11px] text-zinc-500">
                {visibleIssues.length} issue{visibleIssues.length !== 1 ? "s" : ""} found
              </span>
            )}
            <button
              type="button"
              onClick={openAiSettings}
              title="Change the Agent Review model in Settings → AI Configuration"
              className="ml-auto truncate text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
            >
              {reviewModelLabel}
            </button>
          </div>

          <AnimatePresence>
            {reviewError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mx-3 mb-2 overflow-hidden rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5"
              >
                <p className="text-[11px] leading-snug text-amber-300">{reviewError}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3">
            {Object.keys(issuesByFile).length > 0 ? (
              Object.entries(issuesByFile).map(([file, issues]) => (
                <div key={file} className="mb-3">
                  <div className="mb-1 flex items-center gap-1.5 px-1">
                    <FileTypeIcon name={baseName(file)} size={12} />
                    <span className="truncate text-[11px] font-semibold text-zinc-300">{file}</span>
                    <span className="text-[10px] text-zinc-600">({issues.length})</span>
                  </div>
                  <ul className="space-y-1">
                    {issues.map((issue) => (
                      <li key={issue.id}>
                        <button
                          type="button"
                          onClick={() => revealIssue(issue)}
                          title="Jump to line and show details"
                          className={`w-full rounded-md border px-2.5 py-2 text-left transition-colors ${
                            activeIssueId === issue.id
                              ? "border-accent/40 bg-accent/10"
                              : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${severityDot(issue.severity)}`} />
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] font-medium text-zinc-200">
                                {issue.title}
                              </span>
                              <span className="mt-0.5 block text-[10px] text-zinc-600">
                                {SEVERITY_LABEL[issue.severity]} · line {issue.line}
                              </span>
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : !reviewing ? (
              <div className="flex flex-col items-center justify-center px-8 py-12 text-center">
                <AgentSvg />
                <p className="mt-3 text-[13px] font-medium text-zinc-300">
                  {reviewIssues.length > 0 ? "All issues resolved" : "Agent Review"}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {reviewIssues.length > 0
                    ? "Every issue found in this review has been dismissed."
                    : "Run a review to have GLM 5 analyze your changes for bugs and regressions."}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <AnimatePresence>
        {contextMenu && (
          <FileContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            onRevert={() => handleRevertFile(contextMenu.file.path)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FileContextMenu({
  x,
  y,
  onClose,
  onRevert,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onRevert: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 100);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      <motion.div
        role="menu"
        initial={{ opacity: 0, scale: 0.97, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.08 }}
        style={{ left: adjustedX, top: adjustedY }}
        className="fixed z-50 w-[180px] overflow-hidden rounded-lg border border-white/[0.05] bg-[#0d0d0d] py-1 shadow-[0_8px_40px_rgba(0,0,0,0.85)] text-[13px]"
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onRevert();
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-[5px] text-left text-red-400 transition-colors hover:bg-red-500/[0.12] cursor-pointer"
        >
          <span>Discard Changes</span>
        </button>
      </motion.div>
    </>
  );
}
