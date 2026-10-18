#!/usr/bin/env bash
# shellcheck shell=bash
# Once-per-turn record for the reminder hooks (be-subagent-verify.sh here; be-edit-hooks.mjs keeps its
# own markers in the same directory): a reminder reaches the model through PostToolUse
# additionalContext the first time it applies in a turn, and not again on every later edit of
# that turn.
# be-prompt-skill-router.sh (UserPromptSubmit) starts each turn by clearing the record.
#
# The record is one empty file per reminder under $TMPDIR/clinozy-be-hooks/<session_id>/.
# Fail-open: when the directory cannot be written, every reminder counts as new.

turn_state_dir() {
  printf '%s/clinozy-be-hooks/%s' "${TMPDIR:-/tmp}" "${1:-unknown-session}"
}

# turn_once SESSION_ID KEY — succeeds the first time KEY is seen in this turn.
turn_once() {
  local directory marker
  directory="$(turn_state_dir "$1")"
  mkdir -p "${directory}" 2>/dev/null || return 0
  marker="${directory}/$(printf '%s' "$2" | cksum | cut -d' ' -f1)"
  [ -e "${marker}" ] && return 1
  : >"${marker}" 2>/dev/null || true
  return 0
}

# turn_mark SESSION_ID KEY — records KEY for the rest of this turn (e.g. the user ran /be-ship).
turn_mark() {
  local directory
  directory="$(turn_state_dir "$1")"
  mkdir -p "${directory}" 2>/dev/null || return 0
  : >"${directory}/$(printf '%s' "$2" | cksum | cut -d' ' -f1)" 2>/dev/null || true
}

# turn_marked SESSION_ID KEY — succeeds when KEY was recorded in this turn.
turn_marked() {
  [ -e "$(turn_state_dir "$1")/$(printf '%s' "$2" | cksum | cut -d' ' -f1)" ]
}

# turn_reset SESSION_ID — a new prompt starts a new turn.
turn_reset() {
  local directory
  directory="$(turn_state_dir "$1")"
  [ -d "${directory}" ] || return 0
  find "${directory}" -type f -delete 2>/dev/null || true
}
