#!/usr/bin/env node
// Cursor `beforeReadFile` guardrail for clinozy-be (Cursor agent hooks, beta).
//
// Blocks the agent from reading real secrets files — the same path set the
// Claude PreToolUse guardrail (be-guardrails.mjs) denies: `.env.<env>` (but not
// the committed `*.example` templates), `.setup-credentials`, `.setup-state.*`.
// Cursor sessions previously had NO read protection at all.
//
// Reads the hook payload on stdin; prints { permission: "allow" | "deny" }.
// Fail-open: any error allows the read.
import { readHookPayload } from "./_be-hook.mjs";
import { isReadableSecretPath } from "./_be-guard-rules.mjs";
import { recordTelemetry } from "./_be-telemetry.mjs";

function allow() {
  recordTelemetry("be-cursor-read-guard", "beforeReadFile", "silent");
  process.stdout.write(JSON.stringify({ continue: true, permission: "allow" }));
  process.exit(0);
}
function deny(message) {
  recordTelemetry("be-cursor-read-guard", "beforeReadFile", "fired");
  process.stdout.write(
    JSON.stringify({ continue: true, permission: "deny", userMessage: message, agentMessage: message }),
  );
  process.exit(0);
}

const payload = readHookPayload() ?? allow();

const filePath =
  payload.file_path || payload.filePath || payload.path || (payload.tool_input && payload.tool_input.file_path) || "";
if (!filePath) allow();

if (isReadableSecretPath(filePath)) {
  deny(
    "clinozy-be guardrail: reading secrets files (.env.<env> / .setup-credentials / .setup-state.*) is not allowed for the agent — they hold provisioned secrets. Use .env.example for structure; a human can read values directly.",
  );
}
allow();
