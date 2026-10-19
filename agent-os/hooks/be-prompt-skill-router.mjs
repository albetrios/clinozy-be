#!/usr/bin/env node
// Claude Code UserPromptSubmit hook for clinozy-be.
//
// When a prompt describes a build/change task, inject the relevant skill chain — plus the
// "consult be-skill-index FIRST" rule and the requirement-intake checklist — as
// additionalContext. This operationalizes CLAUDE.md's skill-first workflow at PROMPT time; the
// PostToolUse skill reminders (be-edit-hooks.mjs) only fire reactively, AFTER an edit. The
// keyword→skill map mirrors agent-os/docs/skill-triggers.md.
//
// Conservative by design: requires a build/change verb AND a domain noun, so ordinary prompts
// (questions, "run the tests", "explain this") produce nothing and never nag. A new prompt is a
// new turn: it clears the once-per-turn record (_be-turn-once.mjs) and marks a /be-ship or
// /be-open-pr turn as the PR request. Fails OPEN: no payload, no prompt, or no match exits 0
// silently.
import { addModelContext, readHookPayload } from "./_be-hook.mjs";
import { recordTelemetry } from "./_be-telemetry.mjs";
import { markTurn, resetTurn } from "./_be-turn-once.mjs";

const BUILD_INTENT = /\b(add|create|new|implement|build|introduce|scaffold|generate|wire|register|expose|rename)\b/;

/** [pattern on the lowercased prompt, skill chain] — the prompt-time slice of skill-triggers.md. */
const ROUTES = [
  [/\b(route|routes|endpoint|endpoints)\b/, "route/endpoint → be-api-contract-guard → be-route-schema-doc-guard → be-route-catalog → be-seed-maintainer"],
  [/\b(domain|sub-domain|subdomain)\b/, "domain/sub-domain → be-domain-generator (start at docs/getting-started/requirement-intake.md)"],
  [/\b(schema|table|tables|column|columns|migration|migrations)\b/, "schema/table/migration → be-schema-generator → be-sql-design-guard → be-db-migration-maintainer → be-rls-tenant-isolation-guard"],
  [/\b(worker|workers|queue|queues|job|jobs|bullmq)\b|event handler/, "worker/queue/event → be-workers-events"],
  [/env var|environment variable|env-schema|\.env\b/, "env var → be-env-schema-add"],
  [/\b(i18n|translation|translations|locale|locales)\b/, "i18n/locale → be-i18n-message-guard"],
  [/\b(validator|serializer|serialiser)\b/, "validator/serializer → be-test-generator"],
  [/\b(seed|seeds|seeder|seeding)\b/, "seed → be-seed-maintainer"],
];

const payload = readHookPayload();
let status = "silent";
if (payload) {
  resetTurn(payload.session_id);
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  // /be-ship and /be-open-pr are the user asking for a PR in so many words: be-no-unrequested-pr.mjs
  // lets this turn's PR creation through without a second confirmation. (The hook sees the prompt
  // as typed — `/be-ship <title>` — checked on Claude Code 2.1.302.)
  if (/^\s*\/be-(ship|open-pr)(\s|$)/m.test(prompt)) {
    markTurn({ session: payload.session_id, mark: "pr-requested" });
  }
  const lower = prompt.toLowerCase();
  const hints = BUILD_INTENT.test(lower) ? ROUTES.filter(([pattern]) => pattern.test(lower)) : [];
  if (hints.length > 0) {
    addModelContext({
      event: "UserPromptSubmit",
      context: [
        "🧭 clinozy-be skill routing — consult agent-os/skills/be-skill-index/SKILL.md FIRST, then run:",
        ...hints.map(([, chain]) => `  • ${chain}`),
        "New requirement? docs/getting-started/requirement-intake.md · Full map: agent-os/docs/skill-triggers.md",
      ].join("\n"),
    });
    status = "fired";
  }
}
recordTelemetry("be-prompt-skill-router", "UserPromptSubmit", status);
