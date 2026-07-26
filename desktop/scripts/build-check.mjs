#!/usr/bin/env node
/**
 * Build-based verification for the Tauri app: runs `pnpm tauri build`, streams
 * its output, and scans for compiler/bundler errors. Replaces launching the app
 * and exercising it by hand — a clean build is the pass condition, and any
 * error line fails the check with the offending output echoed back.
 *
 * Usage: pnpm build:check [-- --extra-tauri-args]
 */
import { spawn } from "node:child_process";

const ERROR_PATTERNS = [
  /^error(\[E\d+\])?:/i,
  // tsc reports as `src/x.ts(12,3): error TS2322: …`, so the anchor can't be ^error.
  /\berror TS\d+:/i,
  /^\s*\d+\s+error/i,
  /^X \[ERROR\]/i,
  /aborting due to \d+ previous error/i,
  /could not compile/i,
  /^failed to /i,
  /failed with exit code/i,
  /Error: Command failed/i,
  /\berror\b.*\bbundling\b/i,
];

const IGNORED = [/^warning:/i, /generated \d+ warnings?/i];

// Cargo and Vite colorize output; the patterns above match plain text.
const ANSI = /\[[0-9;]*m/g;

function findErrors(text) {
  const hits = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(ANSI, "").trim();
    if (!line) continue;
    if (IGNORED.some((p) => p.test(line))) continue;
    if (ERROR_PATTERNS.some((p) => p.test(line))) hits.push(line);
  }
  return [...new Set(hits)];
}

const extraArgs = process.argv.slice(2);
const isWindows = process.platform === "win32";
const args = ["tauri", "build", ...extraArgs];

console.log(`[build:check] running: pnpm ${args.join(" ")}`);

// Windows requires a shell to launch pnpm's .cmd shim; quoting the args keeps
// that safe against spaces in user-supplied extras.
const child = isWindows
  ? spawn(`pnpm ${args.map((a) => `"${a}"`).join(" ")}`, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    })
  : spawn("pnpm", args, { stdio: ["ignore", "pipe", "pipe"] });

let combined = "";
const capture = (stream, sink) => {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    combined += chunk;
    sink.write(chunk);
  });
};
capture(child.stdout, process.stdout);
capture(child.stderr, process.stderr);

child.on("error", (err) => {
  console.error(`\n[build:check] FAILED to start build: ${err.message}`);
  process.exit(1);
});

child.on("close", (code) => {
  const errors = findErrors(combined);

  if (code !== 0 || errors.length > 0) {
    console.error(`\n[build:check] BUILD FAILED (exit code ${code})`);
    if (errors.length > 0) {
      console.error(`[build:check] ${errors.length} error line(s) detected:`);
      for (const line of errors.slice(0, 40)) console.error(`  ${line}`);
    }
    process.exit(1);
  }

  const warnings = combined
    .split(/\r?\n/)
    .filter((l) => /^warning:/i.test(l.replace(ANSI, "").trim())).length;
  console.log(`\n[build:check] BUILD CLEAN — no errors detected${warnings ? ` (${warnings} warning lines)` : ""}.`);
});
