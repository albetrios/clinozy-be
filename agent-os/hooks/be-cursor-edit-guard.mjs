#!/usr/bin/env node
// Cursor `afterFileEdit` guardrail for clinozy-be (Cursor agent hooks, beta).
//
// Cursor cannot veto a file edit before it lands, so this is the after-the-fact mirror of the
// Claude `be-guard-edits.mjs` PreToolUse rules — the same rules, from _be-guard-rules.mjs: when an
// edit that just landed violates a hard rule (R1 worker getRequestDatabase, R2 `../` import under
// src/, R3 generated file, R4 removed NODE_ENV value), it tells the agent to revert/fix NOW
// instead of at pre-commit/CI.
//
// Reads the hook payload on stdin; prints { agentMessage } when a rule is hit (advisory — Cursor
// applies no permission semantics to afterFileEdit). Fail-open: any error exits 0 silently.
import { isInsideRepository, readHookPayload } from "./_be-hook.mjs";
import { editRuleViolations } from "./_be-guard-rules.mjs";
import { recordTelemetry } from "./_be-telemetry.mjs";

function done(status, message) {
  recordTelemetry("be-cursor-edit-guard", "afterFileEdit", status);
  if (message) process.stdout.write(JSON.stringify({ agentMessage: message }));
  process.exit(0);
}

const payload = readHookPayload() ?? done("silent");

const filePath =
  payload.file_path || payload.filePath || (payload.tool_input && payload.tool_input.file_path) || "";
if (!filePath) done("silent");

const edits = Array.isArray(payload.edits) ? payload.edits : [];
const content = [
  payload.content,
  payload.new_string,
  ...edits.map((edit) => edit && (edit.new_string || edit.newText || edit.text)),
]
  .filter(Boolean)
  .join("\n");

const violations = editRuleViolations({ filePath, content, inRepository: isInsideRepository(filePath) });

if (violations.length) {
  done(
    "fired",
    `clinozy-be guard (afterFileEdit) — the edit to "${filePath}" violates a hard rule; fix it NOW, before pre-commit/CI:\n- ${violations.map((violation) => violation.reason).join("\n- ")}`,
  );
}
done("silent");
