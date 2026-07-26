import { memo, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { motion, AnimatePresence } from "motion/react";
import {
  buildGitGraph,
  parseRefs,
  ROW_HEIGHT,
  type GitCommit,
  type GitRef,
  type GitRefKind,
  type GraphEdge,
  type GraphNode,
} from "../lib/gitGraph";
import type { CommitHistoryProps } from "../types";

const PANEL_BG = "#050505";
const CARD_WIDTH = 400;
const CARD_HEIGHT = 250;

const AVATAR_CACHE_KEY = "aether.githubAvatars.v1";
const AVATAR_HIT_TTL = 30 * 24 * 60 * 60 * 1000;
const AVATAR_MISS_TTL = 60 * 60 * 1000;

type AvatarEntry = { url: string | null; ts: number };

const avatarCache = new Map<string, AvatarEntry>(loadAvatarCache());
const avatarInflight = new Map<string, Promise<string | null>>();

function loadAvatarCache(): [string, AvatarEntry][] {
  try {
    const raw = localStorage.getItem(AVATAR_CACHE_KEY);
    if (!raw) return [];
    const now = Date.now();
    return (Object.entries(JSON.parse(raw)) as [string, AvatarEntry][]).filter(
      ([, e]) => now - e.ts < (e.url ? AVATAR_HIT_TTL : AVATAR_MISS_TTL)
    );
  } catch {
    return [];
  }
}

function rememberAvatar(key: string, url: string | null): string | null {
  avatarCache.set(key, { url, ts: Date.now() });
  try {
    localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(Object.fromEntries(avatarCache)));
  } catch {
    // storage full or unavailable; in-memory cache still applies
  }
  return url;
}

async function resolveGitHubAvatar(cacheKey: string, authorName: string, email: string): Promise<string | null> {
  const noreply = email.match(/^(\d+\+)?(.+?)@users\.noreply\.github\.com$/);
  if (noreply) {
    return rememberAvatar(cacheKey, `https://github.com/${noreply[2]}.png?size=80`);
  }

  try {
    const response = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(authorName)}+in:name`, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!response.ok) return rememberAvatar(cacheKey, null);

    const data = await response.json();
    const username = data.items?.[0]?.login;
    if (username) return rememberAvatar(cacheKey, `https://github.com/${username}.png?size=80`);
  } catch {
    // offline or rate limited; fall through to initials
  }

  return rememberAvatar(cacheKey, null);
}

async function fetchGitHubAvatar(authorName: string, email: string): Promise<string | null> {
  const cacheKey = email || authorName;

  const cached = avatarCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < (cached.url ? AVATAR_HIT_TTL : AVATAR_MISS_TTL)) {
    return cached.url;
  }

  const inflight = avatarInflight.get(cacheKey);
  if (inflight) return inflight;

  const pending = resolveGitHubAvatar(cacheKey, authorName, email).finally(() => {
    avatarInflight.delete(cacheKey);
  });
  avatarInflight.set(cacheKey, pending);
  return pending;
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function CommitHistory({ rootPath }: CommitHistoryProps) {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ row: number; x: number; y: number } | null>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setFailed(false);
      try {
        const [list, remote] = await Promise.all([
          invoke<GitCommit[]>("git_log", { root: rootPath }),
          invoke<string>("git_remote_url", { root: rootPath }).catch(() => null),
        ]);
        if (cancelled) return;
        setCommits(list);
        const repoPath = remote?.match(/github\.com[:/](.+?)(?:\.git)?$/)?.[1];
        setRepoUrl(repoPath ? `https://github.com/${repoPath}` : null);
      } catch {
        if (cancelled) return;
        setCommits([]);
        setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const graph = useMemo(() => buildGitGraph(commits), [commits]);

  const openCard = (row: number, el: HTMLElement) => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    const rect = el.getBoundingClientRect();
    let x = rect.right + 10;
    if (x + CARD_WIDTH > window.innerWidth - 8) x = Math.max(8, rect.left - CARD_WIDTH - 10);
    const y = Math.min(Math.max(8, rect.top - 6), Math.max(8, window.innerHeight - CARD_HEIGHT - 8));
    setHovered({ row, x, y });
  };

  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHovered(null), 140);
  };

  const keepOpen = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  if (loading) return <HistorySkeleton />;

  if (failed) {
    return (
      <div className="px-4 py-8 text-center text-xs text-zinc-600">
        Not a git repository, or git is unavailable.
      </div>
    );
  }

  if (!graph.nodes.length) {
    return <div className="px-4 py-8 text-center text-xs text-zinc-600">No commits yet.</div>;
  }

  const active = hovered ? graph.nodes[hovered.row] : null;

  return (
    <div className="py-1">
      <div className="relative" style={{ height: graph.height }}>
        <svg
          className="pointer-events-none absolute left-0 top-0 z-10"
          width={graph.gutterWidth}
          height={graph.height}
          aria-hidden
        >
          <GraphEdges edges={graph.edges} />
          <GraphNodes nodes={graph.nodes} laneX={graph.laneX} rowY={graph.rowY} />
          {active && (
            <circle
              cx={graph.laneX(active.lane)}
              cy={graph.rowY(hovered!.row)}
              r={8}
              fill="none"
              stroke={active.color}
              strokeOpacity={0.35}
              strokeWidth={1.5}
            />
          )}
        </svg>

        {graph.nodes.map((node, i) => (
          <CommitRow
            key={node.commit.hash}
            node={node}
            gutter={graph.gutterWidth}
            active={hovered?.row === i}
            onEnter={(el) => openCard(i, el)}
            onLeave={scheduleClose}
          />
        ))}
      </div>

      <AnimatePresence>
        {hovered && active && (
          <CommitCard
            key={active.commit.hash}
            commit={active.commit}
            color={active.color}
            repoUrl={repoUrl}
            x={hovered.x}
            y={hovered.y}
            onEnter={keepOpen}
            onLeave={scheduleClose}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Graph rendering
// ---------------------------------------------------------------------------

const GraphEdges = memo(function GraphEdges({ edges }: { edges: GraphEdge[] }) {
  return (
    <g fill="none" strokeWidth={1.75} strokeLinecap="round">
      {edges.map((e) => (
        <path key={e.key} d={e.d} stroke={e.color} strokeOpacity={e.dangling ? 0.25 : 0.7} />
      ))}
    </g>
  );
});

const GraphNodes = memo(function GraphNodes({
  nodes,
  laneX,
  rowY,
}: {
  nodes: GraphNode[];
  laneX: (lane: number) => number;
  rowY: (row: number) => number;
}) {
  return (
    <g>
      {nodes.map((node, i) => {
        const cx = laneX(node.lane);
        const cy = rowY(i);
        const hollow = node.isHead || node.isMerge;
        return (
          <g key={node.commit.hash}>
            <circle cx={cx} cy={cy} r={5.5} fill={PANEL_BG} />
            <circle
              cx={cx}
              cy={cy}
              r={hollow ? 3.9 : 3.4}
              fill={hollow ? PANEL_BG : node.color}
              stroke={node.color}
              strokeWidth={hollow ? 2 : 0}
            />
            {node.isHead && (
              <circle cx={cx} cy={cy} r={7.5} fill="none" stroke={node.color} strokeOpacity={0.3} strokeWidth={1.5} />
            )}
          </g>
        );
      })}
    </g>
  );
});

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function CommitRow({
  node,
  gutter,
  active,
  onEnter,
  onLeave,
}: {
  node: GraphNode;
  gutter: number;
  active: boolean;
  onEnter: (el: HTMLElement) => void;
  onLeave: () => void;
}) {
  const refs = useMemo(() => parseRefs(node.commit.refs), [node.commit.refs]);
  const shown = refs.slice(0, 2);

  return (
    <div
      onMouseEnter={(e) => onEnter(e.currentTarget)}
      onMouseLeave={onLeave}
      style={{ height: ROW_HEIGHT, paddingLeft: gutter }}
      className={`relative flex items-center gap-2 pr-2 transition-colors ${
        active ? "bg-white/[0.055]" : "hover:bg-white/[0.03]"
      }`}
    >
      <span
        className="shrink-0 font-mono text-[10px] leading-none"
        style={{ color: node.color, opacity: active ? 0.95 : 0.65 }}
      >
        {node.commit.short_hash}
      </span>
      <span className={`min-w-0 flex-1 truncate text-[12px] ${active ? "text-zinc-100" : "text-zinc-300"}`}>
        {node.commit.message}
      </span>
      {shown.length > 0 && (
        <span className="flex shrink-0 items-center gap-1">
          {shown.map((ref) => (
            <RefBadge key={ref.kind + ref.label} gitRef={ref} />
          ))}
          {refs.length > shown.length && (
            <span className="text-[10px] text-zinc-600">+{refs.length - shown.length}</span>
          )}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ref badges
// ---------------------------------------------------------------------------

const REF_STYLES: Record<GitRefKind, string> = {
  head: "border-amber-400/30 bg-amber-400/[0.12] text-amber-200",
  branch: "border-sky-400/25 bg-sky-400/[0.1] text-sky-200",
  remote: "border-violet-400/25 bg-violet-400/[0.1] text-violet-200",
  tag: "border-emerald-400/25 bg-emerald-400/[0.1] text-emerald-200",
  stash: "border-zinc-400/25 bg-zinc-400/[0.1] text-zinc-300",
};

function RefIcon({ kind }: { kind: GitRefKind }) {
  if (kind === "tag") {
    return (
      <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M2 2h5.2L14 8.8 8.8 14 2 7.2V2Z" strokeLinejoin="round" />
        <circle cx="5" cy="5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === "remote") {
    return (
      <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="8" cy="8" r="6" />
        <path d="M2 8h12M8 2c1.8 2 1.8 10 0 12M8 2C6.2 4 6.2 12 8 14" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="4.5" cy="3.5" r="1.9" />
      <circle cx="4.5" cy="12.5" r="1.9" />
      <circle cx="11.5" cy="6" r="1.9" />
      <path d="M4.5 5.4v5.2M11.5 7.9c0 2.2-2.2 2.6-4.4 2.9" strokeLinecap="round" />
    </svg>
  );
}

function RefBadge({ gitRef }: { gitRef: GitRef }) {
  return (
    <span
      title={gitRef.label}
      className={`flex max-w-[110px] items-center gap-1 rounded-full border px-1.5 py-[1px] text-[10px] font-medium leading-[14px] ${REF_STYLES[gitRef.kind]}`}
    >
      <RefIcon kind={gitRef.kind} />
      <span className="truncate">{gitRef.label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Hover card
// ---------------------------------------------------------------------------

function CommitCard({
  commit,
  color,
  repoUrl,
  x,
  y,
  onEnter,
  onLeave,
}: {
  commit: GitCommit;
  color: string;
  repoUrl: string | null;
  x: number;
  y: number;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [avatarError, setAvatarError] = useState(false);
  const [copied, setCopied] = useState(false);

  const name = commit.author || commit.author_email || "Unknown";
  const refs = useMemo(() => parseRefs(commit.refs), [commit.refs]);

  useEffect(() => {
    let cancelled = false;
    setAvatarError(false);
    void fetchGitHubAvatar(name, commit.author_email).then((url) => {
      if (!cancelled) setAvatarUrl(url ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [name, commit.author_email]);

  const copyHash = () => {
    void navigator.clipboard.writeText(commit.hash);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const commitUrl = repoUrl ? `${repoUrl}/commit/${commit.hash}` : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -8, scale: 0.97 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      style={{ position: "fixed", left: x, top: y, width: CARD_WIDTH, zIndex: 9999 }}
      className="overflow-hidden rounded-xl border border-white/[0.1] bg-[#111113]/95 shadow-2xl backdrop-blur-lg"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="h-[2px] w-full" style={{ backgroundColor: color }} />

      <div className="flex items-start gap-3 border-b border-white/[0.08] p-3.5">
        {avatarUrl && !avatarError ? (
          <img
            src={avatarUrl}
            alt={name}
            className="h-9 w-9 shrink-0 rounded-full shadow-lg"
            onError={() => setAvatarError(true)}
          />
        ) : (
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${getAvatarColor(
              commit.author_email || name
            )} text-[14px] font-semibold text-white shadow-lg`}
          >
            {getInitials(name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-semibold text-zinc-200">{name}</span>
            <span className="shrink-0 text-[11px] text-zinc-500">{formatRelative(commit.date)}</span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">{commit.author_email}</p>
          <p className="mt-0.5 text-[11px] text-zinc-600">{formatFullDate(commit.date)}</p>
        </div>
      </div>

      <div className="p-3.5">
        <p className="text-[13px] leading-relaxed text-zinc-200">{commit.message}</p>
        {commit.parents.length > 1 && (
          <p className="mt-2 text-[11px] text-zinc-500">
            Merge of {commit.parents.length} parents ·{" "}
            <span className="font-mono">{commit.parents.map((p) => p.slice(0, 7)).join(" + ")}</span>
          </p>
        )}
      </div>

      {refs.length > 0 && (
        <div className="border-t border-white/[0.06] px-3.5 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {refs.map((ref) => (
              <RefBadge key={ref.kind + ref.label} gitRef={ref} />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-white/[0.06] px-3.5 py-2">
        <button
          type="button"
          onClick={copyHash}
          className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-zinc-400 transition-all hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-zinc-200"
        >
          {copied ? (
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          )}
          {copied ? "copied" : commit.short_hash}
        </button>

        <div className="flex-1" />

        {commitUrl && (
          <button
            type="button"
            onClick={() => void openUrl(commitUrl)}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-400 transition-all hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-zinc-200"
          >
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Open on GitHub
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function HistorySkeleton() {
  return (
    <div className="space-y-2 px-3 py-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-white/[0.08]" />
          <span className="h-2 rounded bg-white/[0.05]" style={{ width: `${45 + ((i * 13) % 45)}%` }} />
        </div>
      ))}
    </div>
  );
}

function formatRelative(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;

  const diffSecs = Math.floor((Date.now() - date.getTime()) / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return diffMins === 1 ? "1 minute ago" : `${diffMins} minutes ago`;
  if (diffHours < 24) return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  if (diffDays < 7) return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return diffWeeks === 1 ? "1 week ago" : `${diffWeeks} weeks ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return diffMonths === 1 ? "1 month ago" : `${diffMonths} months ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

function formatFullDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return (
    date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
    " at " +
    date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  );
}

function getInitials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(seed: string): string {
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
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
