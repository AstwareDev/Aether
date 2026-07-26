export interface GitCommit {
  hash: string;
  short_hash: string;
  author: string;
  author_email: string;
  date: string;
  message: string;
  refs: string;
  parents: string[];
}

export const LANE_COLORS = [
  "#60a5fa",
  "#34d399",
  "#c084fc",
  "#fbbf24",
  "#f472b6",
  "#22d3ee",
  "#a3e635",
  "#fb923c",
];

export const ROW_HEIGHT = 28;

const LANE_PAD = 11;
const BASE_LANE_WIDTH = 14;
const MAX_GUTTER = 118;

export interface GraphNode {
  commit: GitCommit;
  lane: number;
  color: string;
  isMerge: boolean;
  isHead: boolean;
}

export interface GraphEdge {
  key: string;
  d: string;
  color: string;
  /** Runs off the bottom of the loaded window rather than reaching a parent. */
  dangling: boolean;
}

export interface GitGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  laneCount: number;
  gutterWidth: number;
  height: number;
  laneX: (lane: number) => number;
  rowY: (row: number) => number;
}

interface Slot {
  hash: string;
  colorIdx: number;
  /** Row that opened this slot — edges from that row start at the commit dot. */
  born: number;
}

interface DotLink {
  hash: string;
  lane: number;
  colorIdx: number;
}

function edgePath(x0: number, y0: number, x1: number, y1: number): string {
  if (x0 === x1) return `M${x0},${y0}V${y1}`;
  const bend = (y1 - y0) * 0.5;
  return `M${x0},${y0}C${x0},${y0 + bend} ${x1},${y1 - bend} ${x1},${y1}`;
}

export function isHeadRefs(refs: string): boolean {
  return refs
    .split(",")
    .map((r) => r.trim())
    .some((r) => r === "HEAD" || r.startsWith("HEAD ->"));
}

/**
 * Assigns every commit a lane and derives the SVG paths connecting it to its
 * parents. Commits must arrive in topological order (children before parents).
 */
export function buildGitGraph(commits: GitCommit[]): GitGraph {
  const rowOf = new Map<string, number>();
  commits.forEach((c, i) => {
    if (!rowOf.has(c.hash)) rowOf.set(c.hash, i);
  });

  const lanes: (Slot | null)[] = [];
  const nodes: GraphNode[] = [];
  const states: (Slot | null)[][] = [];
  const dotLinks: DotLink[][] = [];
  let colorCursor = 0;

  const takeColor = (): number => {
    const active = new Set(lanes.filter(Boolean).map((s) => s!.colorIdx));
    for (let i = 0; i < LANE_COLORS.length; i++) {
      const idx = (colorCursor + i) % LANE_COLORS.length;
      if (!active.has(idx)) {
        colorCursor = idx + 1;
        return idx;
      }
    }
    return colorCursor++ % LANE_COLORS.length;
  };

  const claimLane = (from: number): number => {
    for (let i = from; i < lanes.length; i++) if (!lanes[i]) return i;
    for (let i = 0; i < Math.min(from, lanes.length); i++) if (!lanes[i]) return i;
    lanes.push(null);
    return lanes.length - 1;
  };

  for (let r = 0; r < commits.length; r++) {
    const commit = commits[r];
    const links: DotLink[] = [];

    const incoming: number[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i]?.hash === commit.hash) incoming.push(i);
    }

    let lane: number;
    let colorIdx: number;
    if (incoming.length === 0) {
      lane = claimLane(0);
      colorIdx = takeColor();
    } else {
      lane = incoming[0];
      colorIdx = lanes[lane]!.colorIdx;
      for (let k = 1; k < incoming.length; k++) lanes[incoming[k]] = null;
    }

    nodes.push({
      commit,
      lane,
      color: LANE_COLORS[colorIdx],
      isMerge: commit.parents.length > 1,
      isHead: isHeadRefs(commit.refs),
    });

    if (commit.parents.length === 0) {
      lanes[lane] = null;
    } else {
      const [first, ...rest] = commit.parents;
      const firstElsewhere = lanes.findIndex((s, i) => i !== lane && s?.hash === first);
      if (firstElsewhere >= 0) {
        links.push({ hash: first, lane: firstElsewhere, colorIdx: lanes[firstElsewhere]!.colorIdx });
        lanes[lane] = null;
      } else {
        lanes[lane] = { hash: first, colorIdx, born: r };
      }

      for (const parent of rest) {
        const existing = lanes.findIndex((s) => s?.hash === parent);
        if (existing >= 0) {
          links.push({ hash: parent, lane: existing, colorIdx: lanes[existing]!.colorIdx });
          continue;
        }
        const target = claimLane(lane + 1);
        lanes[target] = { hash: parent, colorIdx: takeColor(), born: r };
      }
    }

    while (lanes.length && !lanes[lanes.length - 1]) lanes.pop();
    states.push(lanes.map((s) => (s ? { ...s } : null)));
    dotLinks.push(links);
  }

  const laneCount = Math.max(
    1,
    ...nodes.map((n) => n.lane + 1),
    ...states.map((s) => s.length)
  );
  const laneWidth =
    laneCount > 8
      ? Math.max(7, (MAX_GUTTER - LANE_PAD * 2) / (laneCount - 1))
      : BASE_LANE_WIDTH;
  const gutterWidth = LANE_PAD * 2 + (laneCount - 1) * laneWidth;
  const laneX = (lane: number) => LANE_PAD + lane * laneWidth;
  const rowY = (row: number) => row * ROW_HEIGHT + ROW_HEIGHT / 2;
  const height = Math.max(commits.length, 1) * ROW_HEIGHT;

  const edges: GraphEdge[] = [];
  for (let r = 0; r < nodes.length; r++) {
    const isLast = r === nodes.length - 1;
    const y0 = rowY(r);
    const y1 = isLast ? height : rowY(r + 1);

    states[r].forEach((slot, j) => {
      if (!slot) return;
      const from = slot.born === r ? nodes[r].lane : j;
      const to = rowOf.get(slot.hash) === r + 1 ? nodes[r + 1].lane : j;
      edges.push({
        key: `l${r}.${j}`,
        d: edgePath(laneX(from), y0, laneX(to), y1),
        color: LANE_COLORS[slot.colorIdx],
        dangling: isLast,
      });
    });

    for (const link of dotLinks[r]) {
      const to = rowOf.get(link.hash) === r + 1 ? nodes[r + 1].lane : link.lane;
      edges.push({
        key: `m${r}.${link.lane}`,
        d: edgePath(laneX(nodes[r].lane), y0, laneX(to), y1),
        color: LANE_COLORS[link.colorIdx],
        dangling: isLast,
      });
    }
  }

  return { nodes, edges, laneCount, gutterWidth, height, laneX, rowY };
}

export type GitRefKind = "head" | "branch" | "remote" | "tag" | "stash";

export interface GitRef {
  kind: GitRefKind;
  label: string;
  isHead: boolean;
}

const REMOTE_PREFIXES = ["origin/", "upstream/", "fork/"];

export function parseRefs(refs: string): GitRef[] {
  return refs
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
    .map<GitRef>((raw) => {
      if (raw.startsWith("tag: ")) return { kind: "tag", label: raw.slice(5), isHead: false };
      if (raw.startsWith("HEAD ->")) return { kind: "head", label: raw.slice(7).trim(), isHead: true };
      if (raw === "HEAD") return { kind: "head", label: "HEAD", isHead: true };
      if (raw.startsWith("refs/stash")) return { kind: "stash", label: "stash", isHead: false };
      if (REMOTE_PREFIXES.some((p) => raw.startsWith(p)))
        return { kind: "remote", label: raw, isHead: false };
      return { kind: "branch", label: raw, isHead: false };
    })
    .sort((a, b) => Number(b.isHead) - Number(a.isHead));
}
