#!/usr/bin/env bash
# Starts this repository's local SonarQube in the background once the rest of a cloud session's
# stack is running, so the pre-push quality gate finds the server up instead of booting it (about
# two minutes) on the first push that needs it.
#
# Launched detached, so nothing waits on it: by the backend's bootstrap.sh once the stack is live,
# and by the frontend's session-start hook once it has started the dev server. It waits for
#   1. no bring-up holding the agent-stack lock ($AGENT_STACK_DIR/lock, default /tmp/agent-stack),
#      so SonarQube's boot does not compete with the migrations and the seed — first checked after
#      a 30-second settle window, because the two repositories' session-start hooks run at the
#      same moment and the backend's bootstrap.sh takes the lock a moment after the frontend's hook
#      launches this script, so a check at once can find no lock while a bring-up is starting, then
#   2. a reachable Docker daemon,
# and runs `docker compose -f docker-compose.sonar.yml up -d sonarqube` (a no-op when it is already
# up). It skips when SONAR=0 (the switch `pnpm compose:up` reads) and gives up after
# SONARQUBE_START_WAIT_SECONDS (default 900); either way the pre-push gate still starts SonarQube
# itself when it needs it.
#
# Identical in clinozy-fe (the mirrored-files policy test).
set -uo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
lock_directory="${AGENT_STACK_DIR:-/tmp/agent-stack}/lock"
wait_seconds="${SONARQUBE_START_WAIT_SECONDS:-900}"
settle_seconds=30

log() { echo "start-sonarqube: $*"; }

if [ "${SONAR:-1}" = 0 ]; then
  log "SONAR=0 — not starting SonarQube."
  exit 0
fi

waited=0
while [ "${waited}" -lt "${settle_seconds}" ] || [ -d "${lock_directory}" ] || ! docker info >/dev/null 2>&1; do
  if [ "${waited}" -ge "${wait_seconds}" ]; then
    log "gave up after ${wait_seconds}s (a bring-up still holds ${lock_directory}, or Docker is not reachable) — the pre-push gate starts SonarQube when it needs it."
    exit 0
  fi
  sleep 5
  waited=$((waited + 5))
done

cd "${repository_root}" || exit 1
log "the stack is up after ${waited}s — starting SonarQube (ready in about two minutes)."
docker compose -f docker-compose.sonar.yml up -d sonarqube
