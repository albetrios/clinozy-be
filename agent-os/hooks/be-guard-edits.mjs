#!/usr/bin/env node
// Claude Code PreToolUse hook (Edit | Write | MultiEdit) for clinozy-be.
//
// BLOCKS edits that introduce a hard-rule violation documented in CLAUDE.md and already enforced
// by global tests / CI — moving enforcement left from "you find out at pre-commit/CI" to an
// instant denial at the keystroke. The rules (R1 worker getRequestDatabase, R2 `../` import under
// src/, R3 generated file, R4 removed NODE_ENV value) live in _be-guard-rules.mjs, shared with the
// Cursor mirror (be-cursor-edit-guard.mjs), so the two platforms enforce one set.
//
// Fails OPEN: any read or parse error allows the edit. A hook bug must never brick a session.
import { isInsideRepository, readHookPayload, writePermissionDecision } from "./_be-hook.mjs";
import { editRuleViolations } from "./_be-guard-rules.mjs";
import { recordTelemetry } from "./_be-telemetry.mjs";

function finish(status, violation) {
  if (violation) writePermissionDecision({ decision: violation.decision, reason: violation.reason });
  recordTelemetry("be-guard-edits", "PreToolUse", status);
  process.exit(0);
}

const payload = readHookPayload() ?? finish("silent");
const input = payload.tool_input || {};
const filePath = typeof input.file_path === "string" ? input.file_path : "";
if (!filePath) finish("silent");

const edits = Array.isArray(input.edits) ? input.edits.map((edit) => edit?.new_string) : [];
const content = [input.content, input.new_string, ...edits].filter(Boolean).join("\n");

// A session that holds several repositories runs every repository's hooks on every edit
// (tooling/agent-os/session-hooks.ts); another repository's files are its own hooks' to judge.
const [violation] = editRuleViolations({ filePath, content, inRepository: isInsideRepository(filePath) });
finish(violation ? "fired" : "silent", violation);
