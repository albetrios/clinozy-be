#!/usr/bin/env node
// Claude Code PreToolUse hook (Edit | Write | MultiEdit) for clinozy-be.
//
// BLOCKS edits that introduce a hard-rule violation documented in CLAUDE.md and already enforced
// by global tests / CI — moving enforcement left from "you find out at pre-commit/CI" to an
// instant denial at the keystroke — and ASKS before an edit to the enforcement wiring itself. The
// rules (R1 worker getRequestDatabase, R2 `../` import under src/, R3 generated file, R4 removed
// NODE_ENV value, R5 enforcement wiring) live in _be-guard-rules.mjs, shared with the Cursor mirror
// (be-cursor-edit-guard.mjs), so the two platforms enforce one set.
//
// Fails OPEN: any read or parse error allows the edit. A hook bug must never brick a session.
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { editRuleViolations } from "./_be-guard-rules.mjs";
import { recordTelemetry } from "./_be-telemetry.mjs";

function finish(status, output) {
  recordTelemetry("be-guard-edits", "PreToolUse", status);
  if (output) process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  finish("silent");
}

const input = payload.tool_input || {};
const filePath = input.file_path || "";
if (!filePath) finish("silent");

const edits = Array.isArray(input.edits) ? input.edits.map((edit) => edit?.new_string) : [];
const content = [input.content, input.new_string, ...edits].filter(Boolean).join("\n");

// A session that holds several repositories runs every repository's hooks on every edit
// (tooling/agent-os/session-hooks.ts); another repository's files are its own hooks' to judge.
const root = process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inRepository = !isAbsolute(filePath) || filePath.startsWith(`${root}/`);

const [violation] = editRuleViolations({ filePath, content, inRepository });
if (!violation) finish("silent");
finish("fired", {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: violation.decision,
    permissionDecisionReason: violation.reason,
  },
});
