#!/usr/bin/env node
// Cursor `beforeMCPExecution` guardrail for clinozy-be (Cursor agent hooks, beta).
//
// Mirrors the Claude-side MCP protections for Cursor sessions:
//   - deny an MCP call whose input references a real secrets file
//     (.env.<env> / .setup-credentials / .setup-state.*), same predicate as
//     be-guardrails.mjs;
//   - deny destructive shell smuggled through an MCP tool's command-like input
//     (rm -rf, git push --force, mkfs/dd), same patterns as cursor-shell-guard.
//
// Reads the hook payload on stdin; prints { permission: "allow" | "deny" }.
// Fail-open: any error allows the call.
import { readHookPayload } from "./_be-hook.mjs";
import { isReadableSecretPath } from "./_be-guard-rules.mjs";
import { recordTelemetry } from "./_be-telemetry.mjs";

function allow() {
  recordTelemetry("be-cursor-mcp-guard", "beforeMCPExecution", "silent");
  process.stdout.write(JSON.stringify({ continue: true, permission: "allow" }));
  process.exit(0);
}
function deny(message) {
  recordTelemetry("be-cursor-mcp-guard", "beforeMCPExecution", "fired");
  process.stdout.write(
    JSON.stringify({ continue: true, permission: "deny", userMessage: message, agentMessage: message }),
  );
  process.exit(0);
}

const payload = readHookPayload() ?? allow();

const toolName = payload.tool_name || payload.toolName || payload.name || "";
const input = payload.tool_input || payload.toolInput || payload.input || {};
let inputText = "";
try {
  inputText = typeof input === "string" ? input : JSON.stringify(input);
} catch {
  allow();
}

// Secrets file referenced anywhere in the MCP input (the one rule set, _be-guard-rules.mjs).
const touchesSecret = inputText
  .split(/[\s;|&><()'"`,[\]{}]+/)
  .some((token) => isReadableSecretPath(token.replace(/^['"]|['"]$/g, "")));
if (touchesSecret) {
  deny(
    "clinozy-be guardrail: this MCP call references a secrets file (.env.<env> / .setup-credentials / .setup-state.*) — not allowed for the agent.",
  );
}

// Destructive shell smuggled through a command-like MCP input.
const command = (input && (input.command || input.cmd || input.script)) || "";
if (command && typeof command === "string") {
  const scan = command
    .replace(/<<-?\s*['"]?[A-Za-z_]\w*['"]?[\s\S]*$/, " ")
    .replace(/'[^']*'/g, " ")
    .replace(/"[^"]*"/g, " ");
  if (
    /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i.test(scan) ||
    (/\bgit\s+push\b/i.test(scan) && (/--force(?!-with-lease)/i.test(scan) || /\s-f(?:\s|$)/.test(scan))) ||
    /\bmkfs\b|\bdd\s+if=/i.test(scan)
  ) {
    deny(
      `clinozy-be guardrail blocked a destructive command routed through MCP tool "${toolName}": "${command.slice(0, 160)}". Run it yourself if you truly intend this.`,
    );
  }
}

allow();
