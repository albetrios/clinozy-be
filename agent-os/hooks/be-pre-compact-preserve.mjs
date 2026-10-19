#!/usr/bin/env node
// Claude Code PreCompact hook for clinozy-be.
//
// Before the conversation is compacted, emit a small, high-signal "resume card" so the essentials
// survive: the current branch + uncommitted-change count, any in-progress autonomous build under
// docs/builds/, and a pointer to the agent-os skill-routing map + definition-of-done. This keeps a
// long unattended build from losing the thread (requirement spec / current step / routing) across
// auto-compaction.
//
// Output: PreCompact additionalContext. Fail-open: any error exits 0 and never blocks compaction.
import { spawnSync } from "node:child_process";
import { addModelContext, latestBuildDirectory, repositoryRoot } from "./_be-hook.mjs";
import { recordTelemetry } from "./_be-telemetry.mjs";

const git = (...gitArguments) => {
  const result = spawnSync("git", gitArguments, { cwd: repositoryRoot, encoding: "utf8" });
  return result.status === 0 ? result.stdout : "";
};

try {
  const branch = git("branch", "--show-current").trim() || "?";
  const changedCount = git("status", "--porcelain").split("\n").filter(Boolean).length;
  const build = latestBuildDirectory();
  const card = [
    "RESUME CARD (preserve across compaction)",
    `- Branch: ${branch} · uncommitted files: ${changedCount}`,
    ...(build ? [`- In-progress build: ${build} — reload its build-manifest to resume the requirement.`] : []),
    "- agent-os: consult agent-os/docs/skill-triggers.md + be-skill-index FIRST for any file you change.",
    "- Definition of done: pnpm validate + pnpm agent-os:check green, then pnpm verify:base + /be-pre-merge-review clean.",
  ].join("\n");
  addModelContext({ event: "PreCompact", context: card });
} catch {
  /* fail-open */
}
recordTelemetry("be-pre-compact-preserve", "PreCompact", "fired");
