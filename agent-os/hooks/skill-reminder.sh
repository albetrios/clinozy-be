#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_telemetry.sh"
telemetry_init "skill-reminder" "PostToolUse"
source "$(dirname "${BASH_SOURCE[0]}")/_turn-once.sh"
# Claude Code PostToolUse hook (Edit | Write | MultiEdit).
# Reads the tool JSON from stdin, extracts the edited file path and adds the skill reminders
# its file pattern implies as additionalContext — PostToolUse plain stdout never reaches the
# model. Each reminder appears once per turn (_turn-once.sh), not on every edit.

INPUT=$(cat)
FILE=$(echo "$INPUT" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" \
  2>/dev/null || echo "")
SESSION=$(echo "$INPUT" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null || echo "")

[[ -z "$FILE" ]] && exit 0

# Remind only for files in this repository: a session that holds several repositories runs
# every repository's hooks on every edit (tooling/agent-os/session-hooks.ts).
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
case "$FILE" in
  "$ROOT"/* | [!/]*) ;; # under this repository, or relative to it
  *) exit 0 ;;
esac

REMINDERS=()

[[ "$FILE" == *".routes.ts" ]] && \
  REMINDERS+=("routes → be-route-schema-doc-guard + be-route-catalog + be-seed-maintainer")

[[ "$FILE" == *".schema.ts" ]] && \
  REMINDERS+=("schema → be-schema-generator + be-sql-design-guard + be-db-migration-maintainer + be-rls-tenant-isolation-guard")

[[ "$FILE" == *"env-schema.ts"* || "$FILE" == *".env.example"* ]] && \
  REMINDERS+=("env → be-env-schema-add")

[[ "$FILE" == *"/locales/"*".json" ]] && \
  REMINDERS+=("i18n → be-i18n-message-guard")

[[ "$FILE" == *".validator.ts" || "$FILE" == *".serializer.ts" ]] && \
  REMINDERS+=("validator/serializer → be-test-generator")

[[ "$FILE" == *"/events/"*".ts" || "$FILE" == *"/workers/"*".ts" || \
   "$FILE" == *"/queues/"*".ts" ]] && \
  REMINDERS+=("events/workers/queues → be-workers-events skill")

[[ "$FILE" == *"/database/contexts/"*".ts" || "$FILE" == *".worker.ts" || "$FILE" == *".processor.ts" ]] && \
  REMINDERS+=("tenant data path → be-rls-tenant-isolation-guard (RLS + GUC + context wrappers)")

[[ "$FILE" == *"idempotency"* || "$FILE" == *"stripe.client.ts" ]] && \
  REMINDERS+=("idempotency / stripe writes → be-idempotency-guard")

[[ "$FILE" == *".container.ts" ]] && \
  REMINDERS+=("container → be-domain-generator (check DI wiring)")

NEW_REMINDERS=()
for r in "${REMINDERS[@]}"; do
  turn_once "$SESSION" "skill-reminder:$r" && NEW_REMINDERS+=("$r")
done
[[ "${#NEW_REMINDERS[@]}" -gt 0 ]] || exit 0

telemetry_fired
text="⚡ Skill reminders for $(basename "$FILE"):"
for r in "${NEW_REMINDERS[@]}"; do
  text+=$'\n'"  • $r"
done
text+=$'\n'"  Full map: agent-os/docs/skill-triggers.md"
if command -v jq >/dev/null 2>&1; then
  jq -cn --arg c "$text" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$c}}'
else
  printf '%s\n' "$text"
fi
exit 0
