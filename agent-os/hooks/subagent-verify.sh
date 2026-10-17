#!/usr/bin/env bash
# Claude Code PostToolUse hook (Agent | Task) for clinozy-be.
#
# When a subagent returns, remind the main agent that a subagent's final
# message is a REPORT, not proof: verify load-bearing claims (run the named
# gate, read the cited file) before acting on them, and remember that files a
# subagent edited route through the same skill-triggers map as your own edits.
#
# Sent as PostToolUse additionalContext, once per turn (_turn-once.sh): a SubagentStop hook's
# plain stdout never reaches the main agent, and a blocking one would loop the turn.
# Enforcement stays with the PreToolUse guards and the CI gates. Fails OPEN: any error exits 0.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_telemetry.sh"
source "$(dirname "${BASH_SOURCE[0]}")/_turn-once.sh"
telemetry_init "subagent-verify" "PostToolUse"

command -v jq >/dev/null 2>&1 || exit 0
SESSION=$(jq -r '.session_id // empty' 2>/dev/null || echo "")
turn_once "$SESSION" "subagent-verify" || exit 0

telemetry_fired
text="Subagent finished — its output is a report, not proof. Before relying on it:
- verify load-bearing claims (run the gate it names, read the file it cites);
- if it edited files, those files route through agent-os/docs/skill-triggers.md like your own edits (run the listed skills/gates);
- prefer the be-verifier agent before declaring a task complete."
jq -cn --arg c "$text" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$c}}'
exit 0
