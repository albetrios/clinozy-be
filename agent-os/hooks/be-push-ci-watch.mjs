#!/usr/bin/env node
// Claude Code PostToolUse hook for clinozy-be (Bash `git push*`, registered with `asyncRewake`):
// after a push from the CLI it watches the pushed commit's GitHub Actions runs in the background
// and wakes the model when one fails, so a red CI is triaged at once and nobody polls. It needs an
// authenticated `gh` (a local CLI session); without one, or on any error, it exits 0 silently.
//
// Every 30 s it reads `gh run list --commit <sha>`: up to 5 minutes for the runs to appear, up to
// 40 minutes for them to finish. A failed run exits 2 (wakes the model), naming each failed run
// and asking for be-ci-investigator on it; all green, nothing to watch or a timeout exits 0. A
// cancelled run counts only while HEAD is still the pushed commit (a newer push cancels the older
// runs and starts its own watch). One watch per commit. Switch: AGENT_PUSH_CI_WATCH=0 turns it off.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isInRepository, pushDirectory } from "./_be-push-target.mjs";
import { recordTelemetry } from "./_be-telemetry.mjs";

const HOOK_ID = "be-push-ci-watch";
const POLL_MILLISECONDS = Number(process.env.PUSH_CI_WATCH_POLL_MILLISECONDS || 30_000);
const APPEAR_WITHIN_MILLISECONDS = 5 * 60_000;
const FINISH_WITHIN_MILLISECONDS = 40 * 60_000;
const FAILED_CONCLUSIONS = new Set(["failure", "timed_out", "startup_failure"]);

const repositoryRoot =
  process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const stateRoot = join(process.env.TMPDIR || "/tmp", "clinozy-be-hooks");

function readPayload() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: "utf8" });
  return { ok: result.status === 0, output: (result.stdout || "").trim() };
}

function listRuns(sha) {
  const result = run("gh", [
    "run",
    "list",
    "--commit",
    sha,
    "--json",
    "databaseId,name,status,conclusion,url",
    "--limit",
    "50",
  ]);
  return result.ok ? JSON.parse(result.output || "[]") : null;
}

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

async function watch(payload) {
  if (process.env.AGENT_PUSH_CI_WATCH?.trim() === "0") return "off";
  const command = payload.tool_input?.command || "";
  if (!/\bgit\s+(?:-C\s+\S+\s+)?push\b/.test(command)) return "silent";
  const directory = pushDirectory({ command, cwd: payload.cwd || repositoryRoot });
  if (!isInRepository({ directory, repositoryRoot })) return "silent";
  if (!run("gh", ["auth", "status"]).ok) return "no-gh";
  const sha = run("git", ["rev-parse", "HEAD"]).output;
  if (!sha) return "silent";

  mkdirSync(stateRoot, { recursive: true });
  const lock = join(stateRoot, `${HOOK_ID}-${sha}.lock`);
  if (existsSync(lock)) return "busy";
  writeFileSync(lock, String(process.pid));
  try {
    const started = Date.now();
    while (Date.now() - started < FINISH_WITHIN_MILLISECONDS) {
      const runs = listRuns(sha);
      if (runs === null) return "silent";
      if (runs.length === 0 && Date.now() - started > APPEAR_WITHIN_MILLISECONDS) return "no-runs";
      const stillHead = run("git", ["rev-parse", "HEAD"]).output === sha;
      const failed = runs.filter(
        (workflowRun) =>
          workflowRun.status === "completed" &&
          (FAILED_CONCLUSIONS.has(workflowRun.conclusion) || (stillHead && workflowRun.conclusion === "cancelled")),
      );
      if (failed.length > 0) {
        process.stderr.write(
          [
            `CI failed for the commit you pushed (${sha.slice(0, 7)}):`,
            ...failed.map((workflowRun) => `  - ${workflowRun.name}: ${workflowRun.conclusion} — ${workflowRun.url}`),
            "Start be-ci-investigator on each failed run (in the background), then fix in scope and push.",
          ].join("\n") + "\n",
        );
        return "failed";
      }
      if (runs.length > 0 && runs.every((workflowRun) => workflowRun.status === "completed")) return "green";
      await sleep(POLL_MILLISECONDS);
    }
    return "timeout";
  } finally {
    rmSync(lock, { force: true });
  }
}

let outcome = "error";
try {
  const payload = readPayload();
  outcome = payload ? await watch(payload) : "silent";
} catch {
  /* fail-open */
}
try {
  recordTelemetry(HOOK_ID, "PostToolUse", outcome);
} catch {
  /* telemetry never changes the outcome */
}
process.exit(outcome === "failed" ? 2 : 0);
