import { buildGitGraph, ROW_HEIGHT, type GitCommit } from "./src/lib/gitGraph";

const mk = (h: string, parents: string[], refs = ""): GitCommit => ({
  hash: h, short_hash: h, author: "a", author_email: "a@b.c", date: "2026-01-01T00:00:00Z", message: h, refs, parents,
});
const synth = [
  mk("tipB", ["B2"], "origin/feature"),
  mk("O", ["M", "C1", "D1"], "HEAD -> main"),
  mk("M", ["A2", "B2"]),
  mk("C1", ["R"]), mk("D1", ["R"]),
  mk("A2", ["A1"]), mk("B2", ["B1"]),
  mk("A1", ["R"]), mk("B1", ["R"]), mk("R", []),
];
const g = buildGitGraph(synth);

// sample the path commands onto a character grid (2 cols per px-ish, 1 row per 2px)
const SX = 0.75, SY = 0.25;
const W = Math.ceil(g.gutterWidth * SX) + 2, H = Math.ceil(g.height * SY) + 2;
const grid = Array.from({ length: H }, () => Array(W).fill(" "));
const plot = (x: number, y: number, ch: string) => {
  const cx = Math.round(x * SX), cy = Math.round(y * SY);
  if (cy >= 0 && cy < H && cx >= 0 && cx < W) grid[cy][cx] = ch;
};
const bez = (p: number[], t: number) => {
  const u = 1 - t;
  return u*u*u*p[0] + 3*u*u*t*p[1] + 3*u*t*t*p[2] + t*t*t*p[3];
};
for (const e of g.edges) {
  const m = e.d.match(/^M([\d.]+),([\d.]+)(?:V([\d.]+)|C([\d.]+),([\d.]+) ([\d.]+),([\d.]+) ([\d.]+),([\d.]+))$/)!;
  const x0 = +m[1], y0 = +m[2];
  if (m[3] !== undefined) {
    for (let y = y0; y <= +m[3]; y += 0.5) plot(x0, y, e.dangling ? ":" : "|");
  } else {
    const xs = [x0, +m[4], +m[6], +m[8]], ys = [y0, +m[5], +m[7], +m[9]];
    for (let t = 0; t <= 1; t += 0.005) plot(bez(xs, t), bez(ys, t), "\/".charAt(+m[8] > x0 ? 0 : 1));
  }
}
g.nodes.forEach((n, i) => plot(g.laneX(n.lane), g.rowY(i), n.isHead ? "H" : n.isMerge ? "O" : "*"));

console.log(`lanes=${g.laneCount} gutter=${g.gutterWidth} rowHeight=${ROW_HEIGHT}\n`);
grid.forEach((row, i) => {
  const r = Math.round((i / SY - ROW_HEIGHT / 2) / ROW_HEIGHT);
  const label = Math.abs(r * ROW_HEIGHT + ROW_HEIGHT / 2 - i / SY) < 1 ? `  ${g.nodes[r]?.commit.hash ?? ""}` : "";
  console.log(row.join("") + label);
});
