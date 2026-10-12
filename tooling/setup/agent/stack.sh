#!/usr/bin/env bash
# Status and stop for the live playground stack that `bootstrap.sh` brings up (the session-
# start hook launches it in every web session unless AGENT_AUTO_STACK=0).
#
#   bash tooling/setup/agent/stack.sh status   # pnpm dev:stack:status — the bring-up step
#                                              #   (or "live"), API + worker health, logs
#   bash tooling/setup/agent/stack.sh stop     # pnpm dev:stack:stop — stop the API + worker
#                                              #   (Postgres + Redis stay: pnpm compose:down)
#
# A scratch database again (drop, recreate, migrate, seed, restart): pnpm dev:stack:reset-db
# (bootstrap.sh --reset-database).
#
# Works from the files bootstrap.sh writes to $AGENT_STACK_DIR (default /tmp/agent-stack):
# `status`, `bootstrap.log`, and `<api|worker>.{log,pid}`. Linux and macOS (`ps`, no /proc).
set -uo pipefail

readonly STACK_DIR="${AGENT_STACK_DIR:-/tmp/agent-stack}"
readonly API_URL="http://127.0.0.1:${PORT:-3000}"
readonly WORKER_URL="http://127.0.0.1:${WORKER_HEALTH_PORT:-9090}"

# curl prints 000 itself when nothing answers.
http_code() { curl -s -o /dev/null -m 3 -w '%{http_code}' "$1" 2>/dev/null || true; }

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

show_status() {
  echo "Playground stack ($STACK_DIR)"
  if [ -f "${STACK_DIR}/status" ]; then
    echo "  bring-up   $(cat "${STACK_DIR}/status")"
  else
    echo "  bring-up   not started — bash tooling/setup/agent/bootstrap.sh"
  fi
  if [ -d "${STACK_DIR}/lock" ]; then
    echo "  running    bring-up in progress (pid $(cat "${STACK_DIR}/lock/pid" 2>/dev/null || echo '?')) — tail -f ${STACK_DIR}/bootstrap.log"
  fi
  echo "  API        ${API_URL}  livez $(http_code "${API_URL}/livez") · readyz $(http_code "${API_URL}/readyz")"
  echo "  worker     ${WORKER_URL}  livez $(http_code "${WORKER_URL}/livez") · readyz $(http_code "${WORKER_URL}/readyz")"
  if command -v docker >/dev/null 2>&1; then
    echo "  containers $(docker ps --format '{{.Names}} ({{.Status}})' 2>/dev/null | paste -sd' ' - || echo 'docker unreachable')"
  fi
  echo "  logs       ${STACK_DIR}/{bootstrap,api,worker}.log"
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
  [ -d "${STACK_DIR}" ] && printf '%s  stopped — bash tooling/setup/agent/bootstrap.sh brings it back\n' \
    "$(date -u '+%H:%M:%SZ')" > "${STACK_DIR}/status"
  echo "stack: Postgres + Redis are still up (pnpm compose:down stops them)."
}

case "${1:-status}" in
  status) show_status ;;
  stop) stop_stack ;;
  *)
    echo "usage: stack.sh [status|stop]" >&2
    exit 2
    ;;
esac
