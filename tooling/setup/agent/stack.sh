#!/usr/bin/env bash
# Wait, status, sign-in check and stop for the live playground stack that `bootstrap.sh` brings up
# (the session-start hook launches it in every web session).
#
#   bash tooling/setup/agent/stack.sh wait     # pnpm dev:stack:wait — blocks until the bring-up is
#                                              #   live (exit 0) or failed (exit 1, with the step
#                                              #   and the log's tail); prints each step as it starts
#   bash tooling/setup/agent/stack.sh status   # pnpm dev:stack:status — the bring-up step (or
#                                              #   "live"), API + worker health, clinozy-fe's dev
#                                              #   server, SonarQube, the agent tools, logs
#   bash tooling/setup/agent/stack.sh verify   # pnpm dev:stack:verify — the demo user signs in
#                                              #   through the API, and through Vite when it serves
#   bash tooling/setup/agent/stack.sh stop     # pnpm dev:stack:stop — stop the API + worker
#                                              #   (Postgres + Redis stay: pnpm compose:down)
#
# A scratch database again (drop, recreate, migrate, seed, restart): pnpm dev:stack:reset-db
# (bootstrap.sh --reset-database).
#
# Works from the files bootstrap.sh writes to $AGENT_STACK_DIR (default /tmp/agent-stack):
# `status` (one line, stamped with its boot: a line from before a pause is no status at all),
# `bootstrap.log`, and `<api|worker|agent-tools>.{log,pid}`. Linux and macOS (`ps`, no /proc).
set -uo pipefail
AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly AGENT_DIR
# shellcheck source=tooling/setup/agent/stack-lock.lib.sh
source "${AGENT_DIR}/stack-lock.lib.sh"

readonly STACK_DIR="${AGENT_STACK_DIR:-/tmp/agent-stack}"
readonly API_URL="http://127.0.0.1:${PORT:-3000}"
readonly WORKER_URL="http://127.0.0.1:${WORKER_HEALTH_PORT:-9090}"
# clinozy-fe's dev server, as its session-start hook and healthcheck probe it (Vite binds localhost).
readonly FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"

# curl prints 000 itself when nothing answers.
http_code() { curl -s -o /dev/null -m 3 -w '%{http_code}' "$1" 2>/dev/null || true; }

# True when clinozy-fe's dev server serves the app shell (Vite rewrites the /src/main.tsx entry).
frontend_serves() { curl -s -m 3 "${FRONTEND_URL}/" 2>/dev/null | grep -q '/src/main.tsx'; }

# A SonarQube server's state on a host port: UP, STARTING, … or "down".
sonarqube_state() {
  local body
  body="$(curl -s -m 3 "http://127.0.0.1:$1/api/system/status" 2>/dev/null || true)"
  printf '%s' "${body}" | grep -o '"status":"[A-Z_]*"' | cut -d'"' -f4 | grep . || echo down
}

# Every descendant of a process (pnpm -> sh -> tsx watch -> node), read from `ps`,
# which Linux and macOS both have — `/proc` is Linux-only.
descendant_pids() {
  local parent=$1 pid ppid
  ps -A -o pid= -o ppid= | while read -r pid ppid; do
    [ "$ppid" = "$parent" ] || continue
    echo "$pid"
    descendant_pids "$pid"
  done
}

# Stop a process the bring-up started and everything it spawned. The whole tree is
# collected before anything is signalled, so no child is orphaned and missed, and nothing
# outside it (another checkout's `tsx watch`) is touched.
stop_process_tree() {
  local pids
  pids="$(descendant_pids "$1") $1"
  # shellcheck disable=SC2086 # one PID per word
  kill -TERM ${pids} 2>/dev/null || true
}

# The agent tools' background run: running, or the last line of its log.
agent_tools_state() {
  local pid
  pid="$(cat "${STACK_DIR}/agent-tools.pid" 2>/dev/null || true)"
  if [ -n "${pid}" ] && ps -p "${pid}" -o args= 2>/dev/null | grep -q 'install-agent-tools\.sh'; then
    echo "installing in the background (pid ${pid}) — ${STACK_DIR}/agent-tools.log"
  elif [ -s "${STACK_DIR}/agent-tools.log" ]; then
    tail -n 1 "${STACK_DIR}/agent-tools.log"
  else
    echo "not run yet"
  fi
}

show_status() {
  local holder="" status_line note=""
  holder="$(stack_lock_holder "${STACK_DIR}")"
  echo "Playground stack ($STACK_DIR)"
  if status_line="$(stack_status_line "${STACK_DIR}")"; then
    # A "running" step with no live bring-up behind it was left by a run that is gone.
    case "${status_line}" in
      *"  running "*) [ -n "${holder}" ] || note="  (stale — no bring-up is running)" ;;
    esac
    echo "  bring-up   ${status_line}${note}"
  elif [ -f "${STACK_DIR}/status" ]; then
    echo "  bring-up   none in this boot (the last line is from an earlier one: $(cat "${STACK_DIR}/status"))"
  else
    echo "  bring-up   not started — bash tooling/setup/agent/bootstrap.sh"
  fi
  if [ -n "${holder}" ]; then
    echo "  running    bring-up in progress (pid ${holder}) — tail -f ${STACK_DIR}/bootstrap.log"
  elif [ -d "${STACK_DIR}/lock" ]; then
    echo "  lock       stale (pid $(cat "${STACK_DIR}/lock/pid" 2>/dev/null || echo '?') is no bring-up running in this boot) — the next bootstrap.sh run clears it"
  fi
  echo "  API        ${API_URL}  livez $(http_code "${API_URL}/livez") · readyz $(http_code "${API_URL}/readyz")"
  echo "  worker     ${WORKER_URL}  livez $(http_code "${WORKER_URL}/livez") · readyz $(http_code "${WORKER_URL}/readyz")"
  if frontend_serves; then
    echo "  frontend   ${FRONTEND_URL}  serving the app shell"
  else
    echo "  frontend   ${FRONTEND_URL}  not serving (clinozy-fe's session-start hook starts it; log ${STACK_DIR}/frontend.log)"
  fi
  echo "  SonarQube  backend :9000 $(sonarqube_state 9000) · frontend :9001 $(sonarqube_state 9001)"
  echo "  agent      $(agent_tools_state)"
  if command -v docker >/dev/null 2>&1; then
    echo "  containers $(docker ps --format '{{.Names}} ({{.Status}})' 2>/dev/null | paste -sd' ' - || echo 'docker unreachable')"
  fi
  echo "  logs       ${STACK_DIR}/{bootstrap,api,worker,agent-tools}.log"
}

# Blocks until the bring-up of this boot is live and the API answers (exit 0), or it failed
# (exit 1, with the failing step and the log's tail). A session that has just started may not
# have launched its bring-up yet, so "no bring-up" is believed only after STACK_WAIT_GRACE_SECONDS
# (default 20) with none running; STACK_WAIT_SECONDS (default 900) caps the whole wait.
wait_for_live() {
  local now deadline grace_end line="" last="" state=""
  now="$(date +%s)"
  deadline=$((now + ${STACK_WAIT_SECONDS:-900}))
  grace_end=$((now + ${STACK_WAIT_GRACE_SECONDS:-20}))
  while :; do
    if line="$(stack_status_line "${STACK_DIR}")"; then
      state="$(stack_status_state "${line}")"
    else
      line=""
      state=""
    fi
    if [ -n "${line}" ] && [ "${line}" != "${last}" ]; then
      echo "stack: ${line}"
      last="${line}"
    fi
    case "${state}" in
      live)
        if [ "$(http_code "${API_URL}/livez")" = 200 ]; then
          echo "stack: live — API ${API_URL} answers."
          return 0
        fi
        echo "stack: the bring-up went live, but the API at ${API_URL} does not answer now — bash tooling/setup/agent/bootstrap.sh brings it back." >&2
        return 1
        ;;
      failed)
        echo "---- ${STACK_DIR}/bootstrap.log (tail) ----" >&2
        tail -n 25 "${STACK_DIR}/bootstrap.log" >&2 2>/dev/null || true
        return 1
        ;;
      stopped)
        echo "stack: stopped — bash tooling/setup/agent/bootstrap.sh brings it back." >&2
        return 1
        ;;
    esac
    now="$(date +%s)"
    if ! stack_lock_holder "${STACK_DIR}" >/dev/null; then
      # A "running" line with no bring-up holding the lock: the run died without a verdict.
      if [ "${state}" = running ] || [ "${now}" -ge "${grace_end}" ]; then
        echo "stack: no bring-up is running in this boot — bash tooling/setup/agent/bootstrap.sh starts one." >&2
        return 1
      fi
    fi
    if [ "${now}" -ge "${deadline}" ]; then
      echo "stack: still not live after ${STACK_WAIT_SECONDS:-900}s — tail -f ${STACK_DIR}/bootstrap.log" >&2
      return 1
    fi
    sleep 1
  done
}

# The demo user signs in through the API and, when clinozy-fe's dev server serves, through it too.
verify_stack() {
  local status=0
  node "${AGENT_DIR}/verify-sign-in.mjs" "${API_URL}" || status=$?
  if frontend_serves; then
    node "${AGENT_DIR}/verify-sign-in.mjs" "${FRONTEND_URL}" || status=$?
  else
    echo "verify-sign-in: ${FRONTEND_URL} is not serving the app shell — checked the API only."
  fi
  return "${status}"
}

stop_stack() {
  local name pid
  for name in api worker; do
    pid="$(cat "${STACK_DIR}/${name}.pid" 2>/dev/null || true)"
    if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
      stop_process_tree "${pid}"
      echo "stack: stopped ${name} (pid ${pid})."
    else
      echo "stack: ${name} not running."
    fi
    rm -f "${STACK_DIR}/${name}.pid"
  done
  # A bring-up that stops them itself (a restart, --reset-database) keeps its own status line, so
  # `pnpm dev:stack:wait` never reads "stopped" in the middle of it.
  if [ -d "${STACK_DIR}" ] && ! stack_lock_holder "${STACK_DIR}" >/dev/null; then
    stack_status_write "${STACK_DIR}" "stopped — bash tooling/setup/agent/bootstrap.sh brings it back"
  fi
  echo "stack: Postgres + Redis are still up (pnpm compose:down stops them)."
}

case "${1:-status}" in
  wait) wait_for_live ;;
  status) show_status ;;
  verify) verify_stack ;;
  stop) stop_stack ;;
  *)
    echo "usage: stack.sh [wait|status|verify|stop]" >&2
    exit 2
    ;;
esac
