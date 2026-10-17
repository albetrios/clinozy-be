#!/usr/bin/env node
// Claude Code PreToolUse guardrail for clinozy-be.
//
// BLOCK (deny): reading or writing secret files, secret content, destructive shell commands.
// ASK: `gh pr create` — a PR only when the user asked (no-unrequested-pr.sh covers the MCP tool).
// WARN (systemMessage): edits to protected paths, cross-domain imports in a service.
//
// Reads the PreToolUse payload on stdin. Fail-open by design: any parse/read
// error allows the tool (exit 0) so a guardrail bug can never brick the agent.
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { recordTelemetry } from "./_telemetry.mjs";

let raw = "";
try {
  raw = readFileSync(0, "utf8");
} catch {
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const tool = payload.tool_name || "";
const input = payload.tool_input || {};
const filePath = input.file_path || input.path || "";
const command = input.command || "";
const isWrite = tool === "Write" || tool === "Edit" || tool === "MultiEdit";
const edits = Array.isArray(input.edits) ? input.edits.map((edit) => edit?.new_string) : [];
const content = [input.content, input.new_string, ...edits].filter(Boolean).join("\n");

// The WARN rules are clinozy-be's conventions, so they judge only files in this repository; the
// BLOCK rules (destructive shell, secrets) guard every path. A session that holds several
// repositories runs every repository's hooks on every call (tooling/agent-os/session-hooks.ts).
const repositoryRoot = process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inRepository = !isAbsolute(filePath) || filePath.startsWith(`${repositoryRoot}/`);

const warnings = [];

// A real secrets file the agent must not read or write: app `.env.<env>`, setup-tooling
// credentials `.setup-credentials` (or legacy `.env.setup`), and `.setup-state.*` — but
// NOT the committed template (`.env.example`).
function isReadableSecretPath(p) {
  if (!p) return false;
  if (/(^|\/)\.setup-credentials$/.test(p)) return true; // setup-tooling input credentials
  if (/(^|\/)\.setup-state\.(json|lock|audit\.log)$/.test(p)) return true;
  if (/(^|\/)\.env\.example$/.test(p) || /(^|\/)\.env\.setup\.example$/.test(p)) return false;
  return /(^|\/)\.env(\.[\w.-]+)?$/.test(p);
}

const SECRET_READ_DENIAL =
  "Blocked by clinozy-be guardrail: reading secrets files (.env.<env> / .setup-credentials / .setup-state.*) " +
  "is not allowed for the agent — they hold provisioned secrets. App config goes in .env.<environment> " +
  "(editable), setup creds in .setup-credentials (off-limits). If a human needs a value, read it from " +
  ".env.<environment> directly.";

function ask(reason) {
  recordTelemetry("guardrails", "PreToolUse", "fired");
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason },
    }),
  );
  process.exit(0);
}

function deny(reason) {
  recordTelemetry("guardrails", "PreToolUse", "fired");
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

// --- BLOCK: agent reading secrets files --------------------------------------
if ((tool === "Read" || tool === "Grep") && isReadableSecretPath(filePath)) {
  deny(SECRET_READ_DENIAL);
}
if (tool === "Bash" && command) {
  // Any token that resolves to a secrets file (cat/grep/cp/source/< redirection, …).
  const touchesSecret = command
    .split(/[\s;|&><()'"`]+/)
    .some((token) => isReadableSecretPath(token.replace(/^['"]|['"]$/g, "")));
  if (touchesSecret) deny(SECRET_READ_DENIAL);
}

// --- BLOCK: destructive shell ------------------------------------------------
if (tool === "Bash" && command) {
  // Scan with quoted strings + heredoc bodies removed, so destructive patterns
  // that merely appear in a message/echo (e.g. a commit message) don't trigger.
  const scan = command
    .replace(/<<-?\s*['"]?[A-Za-z_]\w*['"]?[\s\S]*$/, " ")
    .replace(/'[^']*'/g, " ")
    .replace(/"[^"]*"/g, " ");
  let why = "";
  if (/\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i.test(scan)) {
    why = "recursive force delete (rm -rf)";
  } else if (
    /\bgit\s+push\b/i.test(scan) &&
    (/--force(?!-with-lease)/i.test(scan) || /\s-f(?:\s|$)/.test(scan))
  ) {
    why = "git push --force (use --force-with-lease, or push it yourself)";
  } else if (/:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(scan)) {
    why = "fork bomb";
  } else if (/\bmkfs\b|\bdd\s+if=/i.test(scan)) {
    why = "filesystem-destroying command";
  }
  if (why) {
    deny(
      `Blocked by clinozy-be guardrail: ${why}. Command: "${command.slice(0, 160)}". If you truly intend this, run it yourself in a terminal.`,
    );
  }
  if (/\bgh\s+pr\s+create\b/.test(scan)) {
    ask(
      "clinozy-be policy: open a PR only when the user explicitly asked for one (Bash(gh pr*) is allowlisted, so this hook is the check). Confirm this was requested before proceeding.",
    );
  }
  if (/\bgit\s+reset\s+--hard\b/i.test(scan) || /\bgit\s+clean\s+-[a-z]*f/i.test(scan)) {
    warnings.push(`destructive git op ("${command.slice(0, 80)}") discards uncommitted work.`);
  }
}

// --- BLOCK: secrets ----------------------------------------------------------
// Same path set as reads — app `.env.<env>`, `.setup-credentials`, `.setup-state.*`
// (templates `*.example` excluded). Edit app config in `.env.<environment>`, never these.
if (isWrite && isReadableSecretPath(filePath)) {
  deny(
    `Blocked by clinozy-be guardrail: "${filePath}" is a gitignored secrets file. App config templates go in .env.example; setup-tooling creds in .setup-credentials are written by the setup CLI, not by hand.`,
  );
}
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  /\bsk_live_[A-Za-z0-9]{16,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{36}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
];
if (isWrite && content && secretPatterns.some((re) => re.test(content))) {
  deny(
    "Blocked by clinozy-be guardrail: the content looks like a private key or live credential. Use environment variables / a secret manager instead of committing secrets.",
  );
}

// --- WARN: protected paths ---------------------------------------------------
if (isWrite && filePath && inRepository) {
  if (/(^|\/)migrations\/.+\.sql$/.test(filePath)) {
    warnings.push(
      `editing a migration (${filePath}) — applied migrations are immutable; add a NEW migration instead. Run pnpm db:migrate:lint.`,
    );
  }
  if (/billing\//i.test(filePath) && /(ledger|invoice|charge)/i.test(filePath)) {
    warnings.push(`editing a billing file (${filePath}) — billing ledgers are append-only; confirm this change is additive.`);
  }
}

// --- WARN: env backups belong in .backups/, not the repo root ----------------
// (Secret .env.<env> backups are already denied above; this catches the rest —
// e.g. an example backup — and steers local backups into the gitignored .backups/.)
if (
  isWrite &&
  inRepository &&
  /(^|\/)\.?env[\w.-]*(bak|backup)[\w.-]*$/i.test(filePath) &&
  !filePath.includes("/.backups/")
) {
  warnings.push(
    `writing an env backup to "${filePath}" pollutes the repo root/context — keep local .env backups in .backups/ (gitignored).`,
  );
}

// --- WARN: cross-domain imports in a service ---------------------------------
if (isWrite && inRepository && /src\/domains\/[^/]+\/.*\.service\.ts$/.test(filePath) && content) {
  const own = (filePath.match(/src\/domains\/([^/]+)\//) || [])[1] || "";
  const importRe = /@\/domains\/([^/]+)\/[^'"]*\.(repository|schema)(?:\.js)?['"]/g;
  const offenders = new Set();
  let m;
  while ((m = importRe.exec(content)) !== null) {
    if (m[1] !== own) offenders.add(`@/domains/${m[1]} (${m[2]})`);
  }
  if (offenders.size) {
    warnings.push(
      `service in "${own}" imports another domain's ${[...offenders].join(", ")} — cross-domain access must go through that domain's service, never its repository/schema.`,
    );
  }
}

if (warnings.length) {
  process.stdout.write(JSON.stringify({ systemMessage: "⚠️ clinozy-be guardrail:\n- " + warnings.join("\n- ") }));
}
recordTelemetry("guardrails", "PreToolUse", warnings.length ? "fired" : "silent");
process.exit(0);
