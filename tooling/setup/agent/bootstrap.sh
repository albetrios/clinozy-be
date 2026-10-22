#!/usr/bin/env bash
# The one cloud-agent setup script: install everything, then bring the stack up — live, and
# signed in once to prove it.
#
#   bash tooling/setup/agent/bootstrap.sh                 # the session: setup → live stack
#   bash tooling/setup/agent/bootstrap.sh --install-only  # environment Setup script: the
#                                                         # installs, then a database that has
#                                                         # finished its first-time setup and
#                                                         # migrations, stopped cleanly — cached
#   bash tooling/setup/agent/bootstrap.sh --reset-database
#                                     # pnpm dev:stack:reset-db — a scratch database again:
#                                     # skips the installs, stops the API + worker, then
#                                     # `pnpm db:migrate --reset` drops and recreates the local
#                                     # database: migrate → logins → seed → API → worker → check
#
# A session's steps (the session-start hook launches this detached in every web session):
#    1 Node                      the pinned .nvmrc Node, put first on PATH
#    2 Dependencies              pnpm install — only when Node or the lockfile changed
#    3 Docker CLI + images       only when their installers or the compose files changed
#    4 Environment (.env.local)  every run: it also stops on a remote DATABASE_*_URL
#    5 Postgres + Redis          the Docker daemon has been starting since second 0, in the
#                                background; a volume whose first-time setup was cut short by a
#                                pause is rebuilt (ensure-postgres-volume.sh)
#    6 Database                  pnpm db:migrate: create, migrate, the three local logins
#    7 Seed                      pnpm db:seed:full, with the API and worker booting alongside
#    8 API · 9 Worker            health checked, then left running
#   10 Sign-in check             the demo user signs in through the API (verify-sign-in.mjs)
# Then "live", and in the background the agent's own tools (install-agent-tools.sh: gh,
# CodeGraph, Headroom + the MCP pair + session hooks, gitleaks, semgrep, k6) and SonarQube —
# the app needs none of them, so they never hold "live" up.
#
# Each step writes its name to $AGENT_STACK_DIR/status (default /tmp/agent-stack), stamped with
# this boot (stack-lock.lib.sh), with the full log beside it. `pnpm dev:stack:wait` blocks until
# "live" or "failed"; `pnpm dev:stack:status` / `pnpm dev:stack:stop` (stack.sh). A lock keeps two
# bring-ups from racing; a re-run is safe (live services are kept). Each step's start and outcome,
# and each process launched, also go to a timeline with the UTC time — the Setup script's kept
# with the cached environment (stack-lock.lib.sh) — which `pnpm dev:stack:timeline` prints.
#
# `--install-only` builds the cached environment, so everything it leaves is a file: the
# installs, and a Postgres volume that has finished its first-time setup and the migrations,
# stopped cleanly. A session then never runs that setup, the one step a pause can break. Tool
# installs and that database are best-effort and log ✓/skip without aborting — a failure there
# never fails the environment; dependencies and the env scaffold are HARD gates, and so, in a
# session, are Postgres, migrate, seed, the health checks and the sign-in check (non-zero exit).
set -uo pipefail

install_only=0
reset_database=0
for argument in "$@"; do
  case "${argument}" in
    --install-only) install_only=1 ;;
    --reset-database) reset_database=1 ;;
    *) echo "✗ unknown option: ${argument} (only --install-only or --reset-database)" >&2; exit 2 ;;
  esac
done
if [ "${install_only}" = 1 ] && [ "${reset_database}" = 1 ]; then
  echo "✗ --install-only and --reset-database exclude each other" >&2
  exit 2
fi
# Every run but the cached Setup script brings the stack live.
live=1
[ "${install_only}" = 1 ] && live=0

cd "$(dirname "${BASH_SOURCE[0]}")/../../.." || exit 1
readonly AGENT_DIR="tooling/setup/agent"
readonly DOCKERD_AGENT_MODE_FILE="${DOCKERD_AGENT_MODE_FILE:-/tmp/dockerd-agent-mode}"
readonly STACK_DIR="${AGENT_STACK_DIR:-/tmp/agent-stack}"
readonly STAMP_DIR="node_modules/.agent-stamps"
TOTAL=10
[ "${install_only}" = 1 ] && TOTAL=6
start_ts=$(date +%s)
mkdir -p "${STACK_DIR}"

# shellcheck source=tooling/setup/agent/stack-lock.lib.sh
source "${AGENT_DIR}/stack-lock.lib.sh"

# This run's timeline (stack-lock.lib.sh): a live bring-up's in the stack directory, started once
# it holds the lock below; the Setup script's beside the cached environment, started now.
if [ "${live}" = 1 ]; then
  TIMELINE_FILE="${STACK_DIR}/timeline"
else
  TIMELINE_FILE="$(stack_setup_timeline_directory)/setup-timeline-$(basename "$(pwd)")"
  mkdir -p "$(dirname "${TIMELINE_FILE}")" 2>/dev/null || true
  stack_timeline_start "${TIMELINE_FILE}"
fi
readonly TIMELINE_FILE

# The step that is running (or failed, or "live") — read by `pnpm dev:stack:status` and
# `pnpm dev:stack:wait`, which ignore a line written in another boot.
record_status() {
  [ "${live}" = 1 ] || return 0
  stack_status_write "${STACK_DIR}" "$*"
}

# One line in this run's timeline — `pnpm dev:stack:timeline`.
timeline() { stack_timeline_append "${TIMELINE_FILE}" "$*"; }

# Seconds since this run started, for the log.
elapsed() { echo "$(( $(date +%s) - start_ts ))s"; }

step() { echo ""; echo "▶ $* (+$(elapsed))"; record_status "running ${*}"; timeline "▶ $*"; }
ok()   { echo "✓ $*"; timeline "✓ $*"; }
skip() { echo "• $*"; timeline "• $*"; }
die()  { echo "✗ $*" >&2; record_status "failed — ${*}"; timeline "✗ $*"; exit 1; }

# start_detached NAME COMMAND… — COMMAND in its own session, so it outlives this script
# (and the hook that launched it); output in $STACK_DIR/NAME.log, pid in $STACK_DIR/NAME.pid.
start_detached() {
  local name=$1
  shift
  if command -v setsid >/dev/null 2>&1; then
    setsid nohup "$@" >"${STACK_DIR}/${name}.log" 2>&1 </dev/null &
  else
    nohup "$@" >"${STACK_DIR}/${name}.log" 2>&1 </dev/null &
  fi
  echo $! > "${STACK_DIR}/${name}.pid"
  timeline "  started ${name} (pid $!, log ${STACK_DIR}/${name}.log)"
}

# One bring-up at a time (a session resume, or a manual run while the hook's runs). A lock
# whose holder is gone — or from another boot, carried in by a cached environment — is stale.
if [ "${live}" = 1 ]; then
  if ! mkdir "${STACK_DIR}/lock" 2>/dev/null; then
    if lock_holder="$(stack_lock_holder "${STACK_DIR}")"; then
      echo "bootstrap: a live bring-up is already running (pid ${lock_holder}) — follow ${STACK_DIR}/bootstrap.log" >&2
      exit 0
    fi
    echo "bootstrap: clearing a stale bring-up lock (pid $(cat "${STACK_DIR}/lock/pid" 2>/dev/null || echo '?') is no bring-up running in this boot)." >&2
    rm -f "${STACK_DIR}/lock/pid" "${STACK_DIR}/lock/boot_id"
    rmdir "${STACK_DIR}/lock" 2>/dev/null
    mkdir "${STACK_DIR}/lock" || die "cannot take the bring-up lock ${STACK_DIR}/lock"
  fi
  stack_lock_write "${STACK_DIR}"
  stack_timeline_start "${TIMELINE_FILE}"
  trap 'rm -f "${STACK_DIR}/lock/pid" "${STACK_DIR}/lock/boot_id"; rmdir "${STACK_DIR}/lock" 2>/dev/null' EXIT
fi

echo "cloud bring-up — $(date -u '+%Y-%m-%d %H:%M:%SZ')$([ "${install_only}" = 1 ] && echo ' (install only)')"

# Tools installed per-user (headroom via pip, codegraph via npm) land here. Appended, not
# prepended: other tools drop their own `node` into ~/.local/bin, which must not shadow the
# pinned or nvm Node.
export PATH="${PATH}:${HOME}/.local/bin"

# The Docker daemon starts now, in the background. Nothing touches Docker before step 3 or 5,
# and both wait for this start first, so its start-up overlaps steps 1–4 instead of following
# them. Only a daemon that does not answer is started: ensure-docker-daemon.sh run against a
# running restricted daemon would clear the marker that sends compose to the host-network override.
docker_start_pid=""
if command -v docker >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
  bash "${AGENT_DIR}/ensure-docker-daemon.sh" >"${STACK_DIR}/docker-start.log" 2>&1 &
  docker_start_pid=$!
fi

# Waits for the background start (if one is still running) and copies its log into this one.
await_docker_start() {
  [ -n "${docker_start_pid}" ] || return 0
  wait "${docker_start_pid}" 2>/dev/null || true
  docker_start_pid=""
  cat "${STACK_DIR}/docker-start.log" >&2 2>/dev/null || true
}

# Each install runs only when what it depends on changed since it last succeeded here (the cached
# Setup script, or an earlier bring-up in this container): one stamp per step, the hash of its
# inputs, in $STAMP_DIR. A single stamp over all of them re-ran every install — pnpm install
# alone took 34 s — whenever any script in this directory changed.
hash_of() { "$@" 2>/dev/null | { sha256sum 2>/dev/null || shasum -a 256; } | cut -d' ' -f1; }
stamp_matches() { [ -f "${STAMP_DIR}/$1" ] && [ "$(cat "${STAMP_DIR}/$1")" = "$2" ]; }
stamp_write() { mkdir -p "${STAMP_DIR}" && printf '%s\n' "$2" > "${STAMP_DIR}/$1"; }
dependency_inputs() {
  node -v
  cat .nvmrc pnpm-lock.yaml pnpm-workspace.yaml patches/* 2>/dev/null
  grep '"packageManager"' package.json
}
docker_inputs() {
  cat "${AGENT_DIR}/install-docker.sh" "${AGENT_DIR}/install-docker-images.sh" \
    docker-compose.yml docker-compose.sonar.yml 2>/dev/null
}

# The compose files for the daemon that is running: the host-network override when
# ensure-docker-daemon.sh had to start a restricted one. Exported as COMPOSE_FILE, so every
# compose call — this script's, ensure-postgres-volume.sh's, pnpm compose:wait's — agrees.
use_compose_files() {
  case "$(cat "${DOCKERD_AGENT_MODE_FILE}" 2>/dev/null || true)" in
    restricted*) export COMPOSE_FILE="docker-compose.yml:${AGENT_DIR}/docker-compose.cloud-agent.yml" ;;
    *) unset COMPOSE_FILE ;;
  esac
}

# Postgres + Redis up, with the restricted-Docker fallback; Postgres then usable from the host
# (ensure-postgres-volume.sh rebuilds a volume whose first-time setup was cut short).
start_postgres_and_redis() {
  await_docker_start
  if ! docker info >/dev/null 2>&1; then
    bash "${AGENT_DIR}/ensure-docker-daemon.sh" >&2 || return 1
  fi
  use_compose_files
  local compose_ok=0
  if [ -n "${COMPOSE_FILE:-}" ]; then
    echo "bootstrap: Docker daemon is in $(cat "${DOCKERD_AGENT_MODE_FILE}") mode; using cloud-agent host-network compose override." >&2
    docker compose up -d postgres redis >&2 && compose_ok=1
  else
    SONAR=0 pnpm compose:up >&2 && compose_ok=1
  fi
  if [ "${compose_ok}" -eq 0 ]; then
    echo "bootstrap: standard compose failed — retrying with restricted VFS + cloud-agent override." >&2
    FORCE_RESTRICTED_VFS=1 bash "${AGENT_DIR}/ensure-docker-daemon.sh" >&2 || return 1
    use_compose_files
    docker compose up -d postgres redis >&2 || return 1
  fi
  bash "${AGENT_DIR}/ensure-postgres-volume.sh"
}

# 1) Node runtime ------------------------------------------------------------
step "[1/${TOTAL}] Node runtime"
required_major="24"
[ -f .nvmrc ] && required_major="$(tr -dc '0-9.' < .nvmrc | cut -d. -f1)"
node_prefix="${NODE_INSTALL_PREFIX:-/opt}"
# The pinned Node goes to <prefix>/node<major>, which needs root — install-node.sh runs
# itself through passwordless sudo when this user cannot write there; else best-effort on
# the session Node. Off Linux, install-node.sh exits early — a developer machine's Node
# comes from nvm.
NODE_INSTALL_PREFIX="${node_prefix}" bash "${AGENT_DIR}/install-node.sh" >&2 \
  || skip "install-node best-effort (using session Node)"

# install-node.sh drops the pinned Node into <prefix>/node<major>, but it runs
# in a child process and so cannot change THIS shell's PATH. Activate it here so
# every pnpm step below runs on the pinned Node; otherwise the image default
# (e.g. Node 22) trips pnpm's engineStrict gate at the compose:up step. The
# SessionStart hook (agent-os/hooks/be-session-start.mjs) does the same switch for
# interactive sessions, but does not run when bootstrap.sh is the Setup script.
current_major="$(node -v 2>/dev/null | tr -dc '0-9.' | cut -d. -f1)"
current_major="${current_major:-0}"
if [ "${current_major}" -lt "${required_major}" ] 2>/dev/null; then
  for candidate in \
    "${node_prefix}/node${required_major}/bin" \
    /opt/node"${required_major}"*/bin \
    "${HOME}/.nvm/versions/node/v${required_major}"*/bin \
    /usr/local/node"${required_major}"*/bin; do
    [ -x "${candidate}/node" ] || continue
    export PATH="${candidate}:${PATH}"
    [ -n "${CLAUDE_ENV_FILE:-}" ] && printf 'export PATH=%s:$PATH\n' "${candidate}" >> "${CLAUDE_ENV_FILE}"
    echo "bootstrap: switched to Node $("${candidate}/node" -v) at ${candidate} (was v${current_major}.x)." >&2
    break
  done
fi

node -v >/dev/null 2>&1 || die "Node not available"
if [ "$(node -v 2>/dev/null | tr -dc '0-9.' | cut -d. -f1)" -lt "${required_major}" ] 2>/dev/null; then
  skip "[1/${TOTAL}] Node $(node -v) < required v${required_major} and no pinned Node was found to activate — pnpm engineStrict will reject installs"
else
  ok "[1/${TOTAL}] Node $(node -v)"
fi

# 2-3) The app's installs — skipped by --reset-database, which only brings the stack up again on a
# fresh database (the tools and the dependencies are already in place).
if [ "${reset_database}" = 1 ]; then
  skip "[2-3/${TOTAL}] installs skipped (--reset-database)"
else
  # 2) Dependencies ----------------------------------------------------------
  step "[2/${TOTAL}] Dependencies (pnpm install)"
  dependency_stamp="$(hash_of dependency_inputs)"
  if stamp_matches dependencies "${dependency_stamp}" && [ -x node_modules/.bin/biome ]; then
    skip "[2/${TOTAL}] dependencies current — same Node and lockfile as the last install (${STAMP_DIR}/dependencies)"
  else
    # A fresh image may have Node without pnpm: corepack provides the version package.json pins.
    command -v pnpm >/dev/null 2>&1 \
      || corepack enable --install-directory "$(dirname "$(command -v node)")" 2>/dev/null \
      || corepack enable 2>/dev/null || true
    pnpm install --frozen-lockfile >&2 || die "pnpm install failed"
    stamp_write dependencies "${dependency_stamp}"
    ok "[2/${TOTAL}] dependencies installed"
  fi

  # 3) Docker CLI + images via the registry mirror ----------------------------
  step "[3/${TOTAL}] Docker CLI/Compose + images (mirror + pull)"
  docker_stamp="$(hash_of docker_inputs)"
  if stamp_matches docker "${docker_stamp}" && command -v docker >/dev/null 2>&1; then
    skip "[3/${TOTAL}] Docker CLI and images current — same installers and compose files (${STAMP_DIR}/docker)"
  else
    await_docker_start
    bash "${AGENT_DIR}/install-docker.sh" || true
    bash "${AGENT_DIR}/install-docker-images.sh" || true
    if docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -qE '^postgres:|^redis:'; then
      stamp_write docker "${docker_stamp}"
      ok "[3/${TOTAL}] compose images present: $(docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^postgres:|^redis:' | paste -sd' ' -)"
    else
      skip "[3/${TOTAL}] images not pre-pulled (compose will pull via mirror)"
    fi
  fi
fi

# The cached image's database ------------------------------------------------
# Postgres's first-time setup and the migrations run here, once, and the containers stop cleanly,
# so every session starts on a finished volume. Best-effort: on any failure the session does the
# same work itself.
prime_database() {
  start_postgres_and_redis || return 1
  pnpm db:migrate >&2
}

if [ "${install_only}" = 1 ]; then
  # 4) The agent's tools -------------------------------------------------------
  step "[4/${TOTAL}] Agent tools (gh, CodeGraph, Headroom + MCP pair + session hooks, gitleaks, semgrep, k6)"
  if bash "${AGENT_DIR}/install-agent-tools.sh"; then
    ok "[4/${TOTAL}] agent tools ready"
  else
    skip "[4/${TOTAL}] agent tools: one is missing or off its pin — see the report above (non-fatal)"
  fi

  # 5) Environment files (.env.local) -----------------------------------------
  step "[5/${TOTAL}] Environment (.env.local)"
  pnpm setup:local --only-env >&2 || die "env scaffold failed (pnpm setup:local --only-env)"
  ok "[5/${TOTAL}] .env.local ready"

  # 6) A database for the cache -------------------------------------------------
  step "[6/${TOTAL}] Database for the cached image (Postgres first-time setup + migrations)"
  # Containers already running (this run by hand in a live session) are left running.
  use_compose_files
  already_running="$(docker compose ps -q --status running postgres 2>/dev/null || true)"
  if prime_database; then
    ok "[6/${TOTAL}] database set up and migrated"
  else
    skip "[6/${TOTAL}] database not prepared (non-fatal — the session sets it up itself)"
  fi
  # Stopped either way, cleanly, so nothing is running when the image is cached and no session
  # has to recover a cluster that was stopped mid-write.
  if [ -z "${already_running}" ]; then
    use_compose_files
    docker compose stop >&2 2>&1 || true
  else
    skip "[6/${TOTAL}] Postgres was already running here — left running"
  fi
  echo ""
  echo "✓ install complete in $(elapsed) — every session brings the stack live itself (bash tooling/setup/agent/bootstrap.sh)."
  timeline "install complete in $(elapsed)"
  exit 0
fi

# 4) Environment files (.env.local) -------------------------------------------
# Every run: the file is kept, and the check that stops on a DATABASE_*_URL in the environment
# that is remote or logs in as another role follows the environment's variables, not a file.
step "[4/${TOTAL}] Environment (.env.local)"
pnpm setup:local --only-env >&2 || die "env scaffold failed (pnpm setup:local --only-env)"
ok "[4/${TOTAL}] .env.local ready"

# 5) Postgres + Redis (docker compose) ---------------------------------------
step "[5/${TOTAL}] Postgres + Redis (docker compose)"
start_postgres_and_redis || die "Postgres + Redis did not come up (see the diagnostics above)"
ok "[5/${TOTAL}] Postgres + Redis healthy"

# --reset-database: the API and worker hold connections, so they stop first; the database step
# below then drops and recreates the database (`--reset`, which refuses one that is not local).
if [ "${reset_database}" = 1 ]; then
  step "[5/${TOTAL}] Stop the API + worker for the reset (--reset-database)"
  bash "${AGENT_DIR}/stack.sh" stop >&2
  ok "[5/${TOTAL}] API + worker stopped"
fi

# 6) The database: create, migrate, the logins the migrations create ----------
step "[6/${TOTAL}] Database: create, migrate, logins (pnpm db:migrate)"
if [ "${reset_database}" = 1 ]; then
  pnpm db:migrate --reset >&2 || die "db:migrate --reset failed"
else
  pnpm db:migrate >&2 || die "db:migrate failed"
fi
ok "[6/${TOTAL}] database migrated, logins enabled"

# 7) Seed, with the API and worker already starting --------------------------
# Neither needs the demo data to boot, so both start before the seed and their start-up
# overlaps it. "live" still waits for the seed, both health checks and the sign-in check.
api_url="http://127.0.0.1:${PORT:-3000}"
worker_url="http://127.0.0.1:${WORKER_HEALTH_PORT:-9090}"
# ready (/livez and /readyz answer), unready (/livez only) or down.
http_status() { curl -s -o /dev/null -m 3 -w '%{http_code}' "$1" 2>/dev/null || true; }
service_state() {
  if HEALTHCHECK_URL="$1" HEALTHCHECK_RETRIES=1 bash "${AGENT_DIR}/healthcheck.sh" >/dev/null 2>&1; then
    echo ready
  elif [ "$(http_status "$1/livez")" = 200 ]; then
    echo unready
  else
    echo down
  fi
}
api_state="$(service_state "${api_url}")"
worker_state="$(service_state "${worker_url}")"
# An API or worker that answers /livez but not /readyz was left from before Postgres or Redis
# restarted, its connections gone for good. It is restarted, never joined by a second process,
# which would only fail on the taken port while the health checks kept reaching the old one.
if [ "${api_state}" = unready ] || [ "${worker_state}" = unready ]; then
  echo "bootstrap: the API (${api_state}) or worker (${worker_state}) answers but is not ready — restarting both." >&2
  bash "${AGENT_DIR}/stack.sh" stop >&2
  for _ in $(seq 1 20); do
    [ "$(http_status "${api_url}/livez")" != 200 ] && [ "$(http_status "${worker_url}/livez")" != 200 ] && break
    sleep 1
  done
  api_state="$(service_state "${api_url}")"
  worker_state="$(service_state "${worker_url}")"
  [ "${api_state}" = down ] || die "something still answers on ${api_url} after the API this bring-up started was stopped — stop it, then re-run"
  [ "${worker_state}" = down ] || die "something still answers on ${worker_url} after the worker this bring-up started was stopped — stop it, then re-run"
fi
api_was_live=0; worker_was_live=0
if [ "${api_state}" = ready ]; then
  api_was_live=1
else
  start_detached api pnpm dev
fi
if [ "${worker_state}" = ready ]; then
  worker_was_live=1
else
  start_detached worker pnpm dev:worker
fi

# The full demo set — it includes the minimal reference data and upserts, so a re-run is safe,
# and it dates the demo clinic's day to today.
step "[7/${TOTAL}] Seed (full demo data; API + worker starting alongside)"
pnpm db:seed:full >&2 || die "db:seed:full failed"
ok "[7/${TOTAL}] seed complete"

# 8) API — started in its own session above and left running -----------------
step "[8/${TOTAL}] API live (/livez + /readyz)"
if [ "${api_was_live}" = 1 ]; then
  ok "[8/${TOTAL}] API already live on :${PORT:-3000}"
else
  if ! bash "${AGENT_DIR}/healthcheck.sh"; then
    echo "---- pnpm dev log (tail) ----" >&2
    tail -20 "${STACK_DIR}/api.log" >&2
    die "API healthcheck failed (log: ${STACK_DIR}/api.log)"
  fi
  ok "[8/${TOTAL}] API live on :${PORT:-3000} (kept running)"
fi

# 9) Worker (BullMQ) — its own /livez + /readyz on WORKER_HEALTH_PORT ---------
step "[9/${TOTAL}] Worker live (${worker_url}/readyz)"
if [ "${worker_was_live}" = 1 ]; then
  ok "[9/${TOTAL}] worker already live"
else
  if ! HEALTHCHECK_URL="${worker_url}" bash "${AGENT_DIR}/healthcheck.sh"; then
    echo "---- pnpm dev:worker log (tail) ----" >&2
    tail -20 "${STACK_DIR}/worker.log" >&2
    die "worker healthcheck failed (log: ${STACK_DIR}/worker.log)"
  fi
  ok "[9/${TOTAL}] worker live (kept running)"
fi

# 10) The demo user signs in — "live" means usable, not only healthy ----------
step "[10/${TOTAL}] Sign-in check (the demo user, through the API)"
node "${AGENT_DIR}/verify-sign-in.mjs" "${api_url}" >&2
sign_in_status=$?
case "${sign_in_status}" in
  0) ok "[10/${TOTAL}] the demo user signed in" ;;
  3) skip "[10/${TOTAL}] sign-in check skipped (the reason is above) — the stack itself is up" ;;
  *) die "sign-in check failed — the API is up, but the demo user cannot sign in (see above; log: ${STACK_DIR}/api.log)" ;;
esac

# curl prints 000 itself when nothing answers.
route_state() { curl -s -o /dev/null -m 3 -w '%{http_code}' "$1" 2>/dev/null || true; }
record_status "live — API ${api_url} · worker ${worker_url}"
timeline "live in $(elapsed) — API ${api_url} · worker ${worker_url}"

# The agent's tools, then SonarQube, in the background. The tools install only what changed
# (their own stamp) and sync the CodeGraph index; one run at a time.
agent_tools_pid="$(cat "${STACK_DIR}/agent-tools.pid" 2>/dev/null || true)"
if [ -n "${agent_tools_pid}" ] && ps -p "${agent_tools_pid}" -o args= 2>/dev/null | grep -q 'install-agent-tools\.sh'; then
  agent_tools_note="already running (pid ${agent_tools_pid})"
else
  start_detached agent-tools bash "${AGENT_DIR}/install-agent-tools.sh"
  agent_tools_note="installing in the background"
fi
# SonarQube last: the script waits for this bring-up's lock to clear (the EXIT trap removes it),
# so its two-minute boot never competes with the migrations or the seed, and the pre-push gate
# finds it up instead of booting it.
start_detached sonarqube-backend bash "${AGENT_DIR}/start-sonarqube.sh"
echo ""
echo "✓ playground live in $(elapsed)"
echo "  API          ${api_url}   (/livez · /readyz)"
echo "  API docs     ${api_url}/reference      [HTTP $(route_state "${api_url}/reference")]"
echo "  Queues       ${api_url}/admin/queues   [HTTP $(route_state "${api_url}/admin/queues")]"
echo "  Worker       ${worker_url}/readyz"
echo "  Demo login   demo@example.com — the code screen fills itself in while TEST_MODE is on"
echo "  Agent tools  ${agent_tools_note} (log: ${STACK_DIR}/agent-tools.log)"
echo "  SonarQube    starting in the background for the pre-push gate (log: ${STACK_DIR}/sonarqube-backend.log)"
echo "  Logs         ${STACK_DIR}/{bootstrap,api,worker}.log"
echo "  Wait/status  pnpm dev:stack:wait · pnpm dev:stack:status · pnpm dev:stack:verify · pnpm dev:stack:timeline · pnpm dev:stack:stop"
