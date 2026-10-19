#!/usr/bin/env node
// Claude Code SessionEnd hook for clinozy-be.
//
// When the session ends, surface anything that would be lost: uncommitted working-tree changes
// (the cloud env is ephemeral — uncommitted work is discarded when the container is reclaimed)
// and any in-progress autonomous build under docs/builds/. Informational only; fail-open (always
// exits 0).
import { spawnSync } from "node:child_process";
import { latestBuildDirectory, repositoryRoot } from "./_be-hook.mjs";
import { recordTelemetry } from "./_be-telemetry.mjs";

let status = "silent";
try {
  const changed = spawnSync("git", ["status", "--porcelain"], { cwd: repositoryRoot, encoding: "utf8" });
  const lines = (changed.status === 0 ? changed.stdout : "").split("\n").filter(Boolean);
  const out = [""];
  if (lines.length > 0) {
    status = "fired";
    out.push(`⚠ Session ending with ${lines.length} uncommitted change(s). The cloud env is ephemeral —`);
    out.push('  commit + push to preserve: git add -A && git commit && git push -u origin "$(git branch --show-current)".');
  } else {
    out.push("✓ Session ending — working tree clean.");
  }
  const build = latestBuildDirectory();
  if (build) out.push(`  In-progress build: ${build} (resume from its build-manifest).`);
  process.stdout.write(`${out.join("\n")}\n`);
} catch {
  /* fail-open */
}
recordTelemetry("be-session-end", "SessionEnd", status);
