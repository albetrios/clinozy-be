#!/usr/bin/env node
// Claude Code PostToolUse (Edit | Write) and Stop hook for clinozy-be; Codex Stop hook.
//
// One process per edit (it replaced three bash hooks: the formatter, the skill reminders and the
// gate reminders):
//
// - PostToolUse queues the edited file for formatting and adds, as additionalContext (a
//   PostToolUse hook's plain stdout never reaches the model), the skill reminders its path implies
//   and the gates the uncommitted changes imply. Each reminder appears once per turn: the record
//   lives in the _turn-once.sh directory, which prompt-skill-router.sh clears at every prompt.
// - Stop formats every file queued during the turn with one Biome call, so a turn of many edits
//   formats once, then prints the gate checklist on stdout — Codex shows it; Claude does not pass a
//   Stop hook's stdout to the model, and the hook never blocks the stop.
//
// Formatting keeps `pnpm format`'s scope: Biome-supported files under src/ or
// tooling/, format only (no lint fixes, no import reordering). Lint still runs at pre-commit / CI.
//
// Only files in this repository are judged: a session that holds several repositories runs every
// repository's hooks (tooling/agent-os/session-hooks.ts). Fails open: any error exits 0 with no
// output — a hook must never block or fail an edit.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { recordTelemetry } from "./_telemetry.mjs";

const HOOK_ID = "edit-hooks";
const SKILL_MAP = "Full map: agent-os/docs/skill-triggers.md";
const FORMATTED_DIRECTORIES = ["src/", "tooling/"];
const FORMATTED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc)$/;

/** Skill reminders by edited path. */
const SKILL_REMINDERS = [
  [(file) => file.endsWith(".routes.ts"), "routes → be-route-schema-doc-guard + be-route-catalog + be-seed-maintainer"],
  [
    (file) => file.endsWith(".schema.ts"),
    "schema → be-schema-generator + be-sql-design-guard + be-db-migration-maintainer + be-rls-tenant-isolation-guard",
  ],
  [(file) => file.includes("env-schema.ts") || file.includes(".env.example"), "env → be-env-schema-add"],
  [(file) => /\/locales\/.*\.json$/.test(file), "i18n → be-i18n-message-guard"],
  [(file) => file.endsWith(".validator.ts") || file.endsWith(".serializer.ts"), "validator/serializer → be-test-generator"],
  [(file) => /\/(events|workers|queues)\/.*\.ts$/.test(file), "events/workers/queues → be-workers-events skill"],
  [
    (file) => /\/database\/contexts\/.*\.ts$/.test(file) || file.endsWith(".worker.ts") || file.endsWith(".processor.ts"),
    "tenant data path → be-rls-tenant-isolation-guard (RLS + GUC + context wrappers)",
  ],
  [(file) => file.includes("idempotency") || file.endsWith("stripe.client.ts"), "idempotency / stripe writes → be-idempotency-guard"],
  [(file) => file.endsWith(".container.ts"), "container → be-domain-generator (check DI wiring)"],
];

/** Gates by uncommitted path (the Codex Stop checklist uses the same map). */
const GATE_REMINDERS = [
  [/\.routes\.ts$/, "routes changed → pnpm routes:catalog:check + be-route-schema-doc-guard (be-api-contract-guard)"],
  [/\.schema\.ts$/, "schema changed → be-db-migration-maintainer + pnpm db:migrate:lint + be-rls-tenant-isolation-guard"],
  [/migrations\/.*\.sql$/, "migration SQL → pnpm db:migrate:lint (be-db-migration-maintainer)"],
  [/env-schema\.ts$|\.env\.example$/, "env changed → pnpm tool:sync-env-example (be-env-schema-add)"],
  [/\/locales\/.*\.json$/, "i18n changed → be-i18n-message-guard"],
  [/\.(validator|serializer)\.ts$/, "validator/serializer → be-test-generator (add/refresh tests)"],
  [/\/(events|workers|queues)\/.*\.ts$/, "events/workers/queues → be-workers-events"],
  [/\.worker\.ts$|\/database\/contexts\//, "tenant data path → be-rls-tenant-isolation-guard (RLS + GUC + context wrappers)"],
  [/idempotency|stripe\.client\.ts$/, "idempotency/stripe writes → be-idempotency-guard"],
  [/\.mdc$|^agent-os\/|agent-os\/|CLAUDE\.md$/, "agent-os, rules or docs changed → pnpm agent-os:check (be-structure-maintainer)"],
];

const repositoryRoot =
  process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const stateRoot = join(process.env.TMPDIR || "/tmp", "clinozy-be-hooks");

function readPayload() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

/** The edited file as an absolute path in this repository, or "" when it is elsewhere. */
function repositoryFile(filePath) {
  if (!filePath) return "";
  const absolute = isAbsolute(filePath) ? filePath : join(repositoryRoot, filePath);
  return absolute.startsWith(`${repositoryRoot}/`) ? absolute : "";
}

/** Succeeds the first time `key` is seen this turn (the _turn-once.sh record); fails open. */
function turnOnce(session, key) {
  const directory = join(stateRoot, session);
  try {
    mkdirSync(directory, { recursive: true });
    const marker = join(directory, `${HOOK_ID}-${createHash("sha1").update(key).digest("hex")}`);
    if (existsSync(marker)) return false;
    writeFileSync(marker, "");
  } catch {
    /* every reminder counts as new when the record cannot be written */
  }
  return true;
}

/** The queue of files to format at Stop — outside the turn record, so a missed Stop formats later. */
function formatQueuePath(session) {
  return join(stateRoot, `${session}.format-queue`);
}

/** Uncommitted paths, status prefix stripped; `untracked: false` skips the slow untracked scan. */
function uncommittedPaths({ untracked }) {
  const status = spawnSync("git", ["status", "--porcelain", untracked ? "-unormal" : "-uno"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (status.status !== 0) return [];
  return status.stdout
    .split("\n")
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3));
}

/** The gates the changed paths imply; `extraPaths` adds files the status call does not list. */
function gateReminders({ untracked, extraPaths = [] }) {
  const changed = [...uncommittedPaths({ untracked }), ...extraPaths];
  return GATE_REMINDERS.filter(([pattern]) => changed.some((path) => pattern.test(path))).map(
    ([, reminder]) => reminder,
  );
}

function afterEdit(payload, session) {
  const file = repositoryFile(payload.tool_input?.file_path || "");
  if (!file) return "silent";
  const relative = file.slice(repositoryRoot.length + 1);

  if (FORMATTED_DIRECTORIES.some((directory) => relative.startsWith(directory)) && FORMATTED_EXTENSIONS.test(file)) {
    try {
      mkdirSync(stateRoot, { recursive: true });
      appendFileSync(formatQueuePath(session), `${file}\n`);
    } catch {
      /* not queued: the pre-commit lint-staged run still formats it */
    }
  }

  const sections = [];
  const skills = SKILL_REMINDERS.filter(([applies]) => applies(file))
    .map(([, reminder]) => reminder)
    .filter((reminder) => turnOnce(session, `skill-reminder:${reminder}`));
  if (skills.length > 0) {
    sections.push([`⚡ Skill reminders for ${basename(file)}:`, ...skills.map((reminder) => `  • ${reminder}`), `  ${SKILL_MAP}`].join("\n"));
  }
  // Tracked changes plus this file (a new one is untracked): the untracked scan is a third of
  // the hook's time, and the Stop checklist still reads the whole tree.
  const gates = gateReminders({ untracked: false, extraPaths: [relative] }).filter((reminder) =>
    turnOnce(session, `stop-gate-reminder:${reminder}`),
  );
  if (gates.length > 0) {
    sections.push(
      [
        "📋 Gates implied by your uncommitted changes (run them before you finish):",
        ...gates.map((reminder) => `  • ${reminder}`),
        `  Then: pnpm validate (lint + format + typecheck). ${SKILL_MAP}`,
      ].join("\n"),
    );
  }
  if (sections.length === 0) return "silent";
  process.stdout.write(
    `${JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: sections.join("\n\n") } })}\n`,
  );
  return "fired";
}

function formatQueuedFiles(session) {
  const queue = formatQueuePath(session);
  let files = [];
  try {
    files = [...new Set(readFileSync(queue, "utf8").split("\n").filter(Boolean))].filter((file) => existsSync(file));
    rmSync(queue, { force: true });
  } catch {
    return;
  }
  const biome = join(repositoryRoot, "node_modules", ".bin", "biome");
  if (files.length === 0 || !existsSync(biome)) return;
  spawnSync(biome, ["format", "--write", ...files], { cwd: repositoryRoot, stdio: "ignore" });
}

function atStop(session) {
  formatQueuedFiles(session);
  const gates = gateReminders({ untracked: true });
  if (gates.length > 0) {
    console.log("\n📋 Before you finish — gates implied by your uncommitted changes:");
    for (const reminder of gates) console.log(`  • ${reminder}`);
    console.log(`  Then: pnpm validate (lint + format + typecheck). ${SKILL_MAP}`);
    return "fired";
  }
  console.log("\n📋 Done. Quick checks: pnpm validate:domain --strict && pnpm tsdoc:check");
  console.log("   Skill map: agent-os/docs/skill-triggers.md");
  return "silent";
}

const payload = readPayload();
if (payload) {
  const event = payload.hook_event_name || "Stop";
  const session = payload.session_id || "unknown-session";
  try {
    // The manifest's two entries: edit-hooks (after an edit) and edit-hooks-stop.
    if (event === "PostToolUse") recordTelemetry(HOOK_ID, event, afterEdit(payload, session));
    else recordTelemetry(`${HOOK_ID}-stop`, event, atStop(session));
  } catch {
    /* fail-open */
  }
}
process.exit(0);
