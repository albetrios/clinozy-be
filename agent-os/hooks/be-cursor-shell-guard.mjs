#!/usr/bin/env node
// Cursor `beforeShellExecution` guardrail for clinozy-be (Cursor agent hooks, beta).
//
// Blocks the same destructive shell commands, and the same git-hook skips, as the Claude
// PreToolUse guardrail.
// Companions: be-cursor-read-guard.mjs (beforeReadFile secrets block),
// be-cursor-mcp-guard.mjs (beforeMCPExecution), be-cursor-edit-guard.mjs (afterFileEdit,
// advisory — Cursor cannot veto writes pre-flight; hard policy stays in
// .cursor/rules/be-ai-guardrails.mdc).
//
// Reads the hook payload on stdin; prints { "permission": "allow" | "deny", ... }.
import { readHookPayload } from "./_be-hook.mjs";
import { destructiveShellReason } from "./_be-guard-rules.mjs";
import { recordTelemetry } from "./_be-telemetry.mjs";

function allow() {
  recordTelemetry("be-cursor-shell-guard", "beforeShellExecution", "silent");
  process.stdout.write(JSON.stringify({ continue: true, permission: "allow" }));
  process.exit(0);
}
function deny(message) {
  recordTelemetry("be-cursor-shell-guard", "beforeShellExecution", "fired");
  process.stdout.write(JSON.stringify({ continue: true, permission: "deny", userMessage: message, agentMessage: message }));
  process.exit(0);
}

const payload = readHookPayload() ?? allow();

const command = payload.command || (payload.tool_input && payload.tool_input.command) || payload.shellCommand || "";
if (!command) allow();

// The same rules as the Claude guardrail, from one module (quoted text and heredocs are ignored).
const why = destructiveShellReason(command);
if (why) {
  deny(`clinozy-be guardrail blocked a ${why}: "${command.slice(0, 160)}". Run it yourself in a terminal if you truly intend this.`);
}
allow();
