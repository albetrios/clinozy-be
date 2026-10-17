#!/usr/bin/env bash
# Claude Code PreToolUse hook (mcp__github__create_pull_request).
#
# clinozy-be policy: open a pull request only when the user explicitly asked. This
# escalates every PR-creation attempt to an explicit user confirmation
# (permissionDecision "ask") — a deterministic backstop so an autonomous run
# never opens a PR unprompted. It does NOT block: a genuinely requested PR
# proceeds once the user confirms. A turn the user started with /be-ship or /be-open-pr — the
# commands that ARE the request — goes through without asking again (prompt-skill-router.sh marks
# it; _turn-once.sh).
#
# Fails OPEN: a missing jq exits 0, leaving the normal permission flow in charge.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_telemetry.sh"
telemetry_init "no-unrequested-pr" "PreToolUse"

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
source "$(dirname "${BASH_SOURCE[0]}")/_turn-once.sh"
session=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")
turn_marked "$session" "pr-requested" && exit 0
title=$(printf '%s' "$INPUT" | jq -r '.tool_input.title // empty' 2>/dev/null || echo "")

reason="clinozy-be policy: open a PR only when the user explicitly asked for one."
[[ -n "$title" ]] && reason="${reason} Proposed PR title: \"${title}\"."
reason="${reason} Confirm this was requested before proceeding."

telemetry_fired
jq -cn --arg r "$reason" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
exit 0
