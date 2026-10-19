#!/usr/bin/env node
// Claude Code Stop hook for clinozy-be, registered with `asyncRewake`: at turn end, in the
// background, it runs the unit-level tests the uncommitted changes affect — `pnpm test:select`,
// then its unit, property and global files — within a 60-second budget, one run at a time. A
// failure exits 2, which wakes the model with the failing tests; a pass, a timeout, a skip or
// any error exits 0 and says nothing. App-level database tests stay at push and in the PR.
//
// It skips a tree it already passed (same changes), a selection that runs everything (the push
// does), and a change no unit-level test reaches.
//
// Only this repository is judged: a session that holds several repositories runs every
// repository's hooks, each with its own CLAUDE_PROJECT_DIR (tooling/agent-os/session-hooks.ts).
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { recordTelemetry } from "./_be-telemetry.mjs";

const HOOK_ID = "be-turn-end-tests";
const TEST_BUDGET_MILLISECONDS = 60_000;
const SELECTION_BUDGET_MILLISECONDS = 20_000;
const UNIT_LEVEL_PROJECTS = ["unit", "property", "global"];
const FAILURE_LINES = 40;

const repositoryRoot =
  process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const stateRoot = join(process.env.TMPDIR || "/tmp", "clinozy-be-hooks");
const lockPath = join(stateRoot, `${HOOK_ID}.lock`);
const passedPath = join(stateRoot, `${HOOK_ID}.passed`);

/** A small state file's text, or "" when it is not there — read directly, never exists-then-read. */
function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** Holds the one-run lock, or returns false while a live run holds it. */
function takeLock() {
  mkdirSync(stateRoot, { recursive: true });
  // `wx` takes the lock or fails when it is held, in one step (no check-then-write race). A lock
  // whose holder is gone is removed and taken once more; losing that second race means a live run.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(lockPath, String(process.pid), { flag: "wx" });
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const holder = Number(readText(lockPath));
    try {
      if (holder > 0) {
        process.kill(holder, 0);
        return false;
      }
    } catch {
      /* the holder is gone: take the lock over */
    }
    rmSync(lockPath, { force: true });
  }
  return false;
}

function git(args) {
  const result = spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : "";
}

/** Uncommitted paths that still exist (a rename counts as its new path). */
function changedFiles() {
  return git(["status", "--porcelain", "-unormal"])
    .split("\n")
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3).split(" -> ").pop())
    .filter((path) => existsSync(join(repositoryRoot, path)) && statSync(join(repositoryRoot, path)).isFile());
}

/** Changes the tree's uncommitted state: the diff against HEAD and each untracked file's size and time. */
function fingerprint(files) {
  const hash = createHash("sha1").update(git(["diff", "HEAD"]));
  for (const file of files) {
    const { size, mtimeMs } = statSync(join(repositoryRoot, file));
    hash.update(`${file}:${size}:${mtimeMs}\n`);
  }
  return hash.digest("hex");
}

function bin(name) {
  return join(repositoryRoot, "node_modules", ".bin", name);
}

/** `pnpm test:select --files … --json`, or null when it cannot answer. */
function select(files) {
  const result = spawnSync(bin("tsx"), ["tooling/vitest/select-tests.ts", "--files", files.join(","), "--json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: SELECTION_BUDGET_MILLISECONDS,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) return null;
  const start = result.stdout.indexOf("{");
  return start === -1 ? null : JSON.parse(result.stdout.slice(start));
}

function run() {
  if (!takeLock()) return "busy";
  try {
    const files = changedFiles();
    if (files.length === 0) return "silent";
    const tree = fingerprint(files);
    if (readText(passedPath) === tree) return "already-passed";
    const selection = select(files);
    if (!selection || selection.mode !== "selected") return "silent";
    const projects = UNIT_LEVEL_PROJECTS.filter((project) => selection.projects[project]?.length);
    const tests = projects.flatMap((project) => selection.projects[project]);
    if (tests.length === 0) return "silent";

    const result = spawnSync(
      bin("vitest"),
      ["run", ...projects.flatMap((project) => ["--project", project]), ...tests],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        timeout: TEST_BUDGET_MILLISECONDS,
        killSignal: "SIGKILL",
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: "0" },
      },
    );
    if (result.error || result.signal) return "timeout";
    if (result.status === 0) {
      writeFileSync(passedPath, tree);
      return "passed";
    }
    // Vitest still colors a piped run under some terminals: the wake message is plain text.
    const output = stripVTControlCharacters(`${result.stdout}\n${result.stderr}`);
    const failures = output
      .split("\n")
      .filter((line) => /FAIL|×|✗|AssertionError|Error:/.test(line))
      .slice(0, FAILURE_LINES);
    process.stderr.write(
      [
        `Turn-end tests: the unit-level tests your uncommitted changes affect failed (${tests.length} file(s), ${projects.join(" + ")}):`,
        ...failures,
        `Re-run: pnpm exec vitest run ${projects.map((project) => `--project ${project}`).join(" ")} <file> — or pnpm test:select --why`,
      ].join("\n") + "\n",
    );
    return "failed";
  } finally {
    rmSync(lockPath, { force: true });
  }
}

let outcome = "error";
try {
  outcome = run();
} catch {
  /* fail-open */
}
try {
  recordTelemetry(HOOK_ID, "Stop", outcome);
} catch {
  /* telemetry never changes the outcome */
}
process.exit(outcome === "failed" ? 2 : 0);
