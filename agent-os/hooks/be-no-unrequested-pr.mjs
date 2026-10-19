#!/usr/bin/env node
// Claude Code PreToolUse hook (mcp__github__create_pull_request).
//
// clinozy-be policy: open a pull request only when the user explicitly asked. This escalates every
// PR-creation attempt to an explicit user confirmation (permissionDecision "ask") — a
// deterministic backstop so an autonomous run never opens a PR unprompted. It does NOT block: a
// genuinely requested PR proceeds once the user confirms. A turn the user started with /be-ship or
// /be-open-pr — the commands that ARE the request — goes through without asking again
// (be-prompt-skill-router.mjs marks it; _be-turn-once.mjs).
//
// Fails OPEN: an unreadable payload exits 0, leaving the normal permission flow in charge.
import { readHookPayload, writePermissionDecision } from "./_be-hook.mjs";
import { recordTelemetry } from "./_be-telemetry.mjs";
import { isTurnMarked } from "./_be-turn-once.mjs";

const payload = readHookPayload();
let status = "silent";
if (payload && !isTurnMarked({ session: payload.session_id, mark: "pr-requested" })) {
  const title = payload.tool_input?.title;
  let reason = "clinozy-be policy: open a PR only when the user explicitly asked for one.";
  if (title) reason += ` Proposed PR title: "${title}".`;
  reason += " Confirm this was requested before proceeding.";
  writePermissionDecision({ decision: "ask", reason });
  status = "fired";
}
recordTelemetry("be-no-unrequested-pr", "PreToolUse", status);
