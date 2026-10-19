#!/usr/bin/env node
// Claude Code PostToolUse hook (Agent | Task) for clinozy-be.
//
// When a subagent returns, remind the main agent that a subagent's final message is a REPORT, not
// proof: verify load-bearing claims (run the named gate, read the cited file) before acting on
// them, and remember that files a subagent edited route through the same skill-triggers map as
// your own edits.
//
// Sent as PostToolUse additionalContext, once per turn (_be-turn-once.mjs): a SubagentStop hook's
// plain stdout never reaches the main agent, and a blocking one would loop the turn. Enforcement
// stays with the PreToolUse guards and the CI gates. Fails OPEN: any error exits 0.
import { addModelContext, readHookPayload } from "./_be-hook.mjs";
import { recordTelemetry } from "./_be-telemetry.mjs";
import { turnOnce } from "./_be-turn-once.mjs";

const payload = readHookPayload();
let status = "silent";
if (payload && turnOnce({ session: payload.session_id, key: "be-subagent-verify" })) {
  addModelContext({
    event: "PostToolUse",
    context: [
      "Subagent finished — its output is a report, not proof. Before relying on it:",
      "- verify load-bearing claims (run the gate it names, read the file it cites);",
      "- if it edited files, those files route through agent-os/docs/skill-triggers.md like your own edits (run the listed skills/gates);",
      "- prefer the be-verifier agent before declaring a task complete.",
    ].join("\n"),
  });
  status = "fired";
}
recordTelemetry("be-subagent-verify", "PostToolUse", status);
