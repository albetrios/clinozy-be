#!/usr/bin/env node
// Claude Code PostToolUseFailure hook (Bash).
//
// When a known clinozy-be *sync / validation gate* fails, inject a concise hint with the fix
// command and the owning skill — turning a raw non-zero exit into a fix path. The one non-gate
// rule is the pnpm flag pnpm 12 rejects outright (`-s`), so the next try is right. Scoped to
// those: an ordinary failed command (a grep with no match, a test mid-TDD) produces no output, so
// this never nags.
//
// Adds context via hookSpecificOutput.additionalContext (PostToolUseFailure cannot block — the
// command already ran). Fails OPEN: no payload, no command, or no gate match exits 0 silently.
import { addModelContext, readHookPayload } from "./_be-hook.mjs";
import { recordTelemetry } from "./_be-telemetry.mjs";

/** [does the lowercased command match, fix hint] — in the order the hints are listed. */
const GATES = [
  [(command) => /\bpnpm\s+-s\b/.test(command), "pnpm 12 has no -s shorthand → pnpm --silent <script>, or plain pnpm <script>"],
  [(command) => command.includes("validate:domain"), "domain structure → fix layout per CLAUDE.md › Domain Structure (be-domain-generator / be-structure-maintainer); details: pnpm validate:domain:strict"],
  [(command) => command.includes("routes:catalog"), "route catalog drift → pnpm routes:catalog to regenerate docs/routes.txt"],
  [(command) => command.includes("tsdoc:check"), "TSDoc coverage → add summary + @remarks on new exports; budget tooling/tsdoc-coverage/budget.json (be-tsdoc-export-guard); details: pnpm tsdoc:check:report"],
  [(command) => command.includes("db:migrate:lint"), "migration safety → align with be-db-migration-maintainer (IF NOT EXISTS, no blocking DDL)"],
  [(command) => command.includes("agent-os:check"), "agent-os drift → pnpm agent-os:check:report; fix dead path refs / counts / hook portability (be-structure-maintainer)"],
  [(command) => command.includes("docs:check"), "OpenAPI out of sync → pnpm docs:generate; ensure route schema blocks (be-route-schema-doc-guard)"],
  [(command) => command.includes("sync-env-example"), "env drift → pnpm tool:sync-env-example --fix; keep env-schema + .env.example in sync (be-env-schema-add)"],
  [(command) => command.includes("validate:route"), "route status policy → align declared vs observed statuses (be-api-contract-guard; docs/reference/api/response-codes.md)"],
  // Generic lint/format gate (`pnpm validate` / `pnpm lint`) — but NOT the validate:* subcommands above.
  [(command) => /(pnpm|biome)[^:\n]*(lint|format)|validate([^:]|$)/m.test(command), "lint/format → pnpm lint:fix for autofixable; warnings via be-code-smells-and-best-practices / be-lint-warnings-handler"],
  [(command) => /typecheck|tsc --noemit/.test(command), "type errors → pnpm typecheck for the full list"],
];

const payload = readHookPayload();
const command = typeof payload?.tool_input?.command === "string" ? payload.tool_input.command.toLowerCase() : "";
const hints = command ? GATES.filter(([matches]) => matches(command)).map(([, hint]) => hint) : [];
if (hints.length > 0) {
  addModelContext({
    event: "PostToolUseFailure",
    context: ["⚡ clinozy-be command failed — likely fix:", ...hints.map((hint) => `  • ${hint}`), "Skill map: agent-os/docs/skill-triggers.md"].join("\n"),
  });
}
recordTelemetry("be-gate-failure-hint", "PostToolUseFailure", hints.length > 0 ? "fired" : "silent");
