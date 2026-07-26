import { execSync } from "child_process";
import { buildGitGraph, type GitCommit } from "./src/lib/gitGraph";

function check(label: string, commits: GitCommit[]) {
  const g = buildGitGraph(commits);
  const rowOf = new Map(commits.map((c, i) => [c.hash, i] as const));
  let bad = 0;
  const starts = new Set(g.edges.map((e) => e.d.replace(/^M/, "").split(/[CV]/)[0]));
  const ends = new Set(
    g.edges.map((e) => (e.d.includes("V") ? `${e.d.slice(1).split(",")[0]},${e.d.split("V")[1]}` : e.d.split(" ").pop()!))
  );

  for (let i = 0; i < g.nodes.length; i++) {
    const n = g.nodes[i];
    for (const p of n.commit.parents) {
      const pr = rowOf.get(p);
      if (pr === undefined) continue;
      if (pr <= i) { console.log(`${label}: TOPO VIOLATION ${n.commit.short_hash}`); bad++; }
    }
    // every commit with parents must have an edge leaving its dot
    if (n.commit.parents.length && i < g.nodes.length - 1) {
      if (!starts.has(`${g.laneX(n.lane)},${g.rowY(i)}`)) { console.log(`${label}: NO OUTGOING ${n.commit.short_hash}`); bad++; }
    }
    // every commit that has a child in-window must have an edge arriving at its dot
    const hasChild = commits.some((c) => c.parents.includes(n.commit.hash));
    if (hasChild && !ends.has(`${g.laneX(n.lane)},${g.rowY(i)}`)) {
      console.log(`${label}: NO INCOMING ${n.commit.short_hash}`); bad++;
    }
    if (n.lane < 0 || n.lane >= g.laneCount) { console.log(`${label}: LANE OOB ${n.commit.short_hash}`); bad++; }
  }
  for (const e of g.edges) if (/NaN|undefined/.test(e.d)) { console.log(`${label}: BAD PATH ${e.key} ${e.d}`); bad++; }
  const dupKeys = g.edges.length - new Set(g.edges.map((e) => e.key)).size;
  if (dupKeys) { console.log(`${label}: ${dupKeys} DUPLICATE EDGE KEYS`); bad++; }

  console.log(`${label}: commits=${commits.length} lanes=${g.laneCount} gutter=${g.gutterWidth.toFixed(1)} edges=${g.edges.length} merges=${g.nodes.filter((n) => n.isMerge).length} problems=${bad}`);
  return g;
}

// --- real repo -------------------------------------------------------------
const raw = execSync("git log --max-count=200 --all --topo-order --format=%H\x1f%h\x1f%an\x1f%ae\x1f%aI\x1f%P\x1f%D\x1f%s", {
  cwd: "..", encoding: "utf8", maxBuffer: 1 << 24,
});
const real: GitCommit[] = raw.split("\n").filter(Boolean).map((l) => {
  const p = l.split("\x1f");
  return { hash: p[0], short_hash: p[1], author: p[2], author_email: p[3], date: p[4], parents: p[5] ? p[5].split(/\s+/) : [], refs: p[6], message: p[7] };
});
check("aether", real);

// --- synthetic: merge + parallel branches + octopus + root -----------------
const mk = (h: string, parents: string[], refs = ""): GitCommit => ({
  hash: h, short_hash: h, author: "a", author_email: "a@b.c", date: "2026-01-01T00:00:00Z",
  message: h, refs, parents,
});
// M is a merge of A-side and B-side; O is an octopus merge; R is the root.
const synth = [
  mk("tipB", ["B2"], "origin/feature"),
  mk("O", ["M", "C1", "D1"], "HEAD -> main"),
  mk("M", ["A2", "B2"]),
  mk("C1", ["R"]),
  mk("D1", ["R"]),
  mk("A2", ["A1"]),
  mk("B2", ["B1"]),
  mk("A1", ["R"]),
  mk("B1", ["R"]),
  mk("R", []),
];
const g = check("synthetic", synth);
console.log(g.nodes.map((n, i) => `${String(i).padStart(2)} lane=${n.lane} ${n.color} ${n.commit.hash}${n.isMerge ? " (merge)" : ""}${n.isHead ? " (HEAD)" : ""}`).join("\n"));
