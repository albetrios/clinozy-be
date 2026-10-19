#!/usr/bin/env bash
# The one cloud-agent setup script: install everything, then bring the stack up — live.
#
# Installs — Node (into /opt, as root or via passwordless sudo), dependencies, gh, Docker
# CLI/Compose, Docker images (registry mirror), CodeGraph, Headroom + the default MCP pair,
# gitleaks, semgrep, k6 — each at the version pinned in tool-versions.sh — and scaffolds a
# self-contained `.env.local` (`pnpm setup:local --only-env`, which first stops on a
# DATABASE_*_URL in the environment that is remote or the wrong login, or a remote
# REDIS_URL). Then brings the playground fully live: Postgres + Redis, the database
# (`pnpm db:migrate`: create, migrate, the logins the migrations create), the full demo seed
# (`pnpm db:seed:full`), and the API (12) and the worker (13) started in their own sessions and
# LEFT RUNNING.
#
#   bash tooling/setup/agent/bootstrap.sh                 # the session: setup → live stack
#   bash tooling/setup/agent/bootstrap.sh --install-only  # environment Setup script:
#                                                         # steps 1-8 only, cached
#   bash tooling/setup/agent/bootstrap.sh --reset-database
#                                     # pnpm dev:stack:reset-db — a scratch database again:
#                                     # skips the installs (2-8), stops the API + worker,
#                                     # then `pnpm db:migrate --reset` drops and recreates
#                                     # the local database: migrate → logins → seed → API →
#                                     # worker (9-13)
#
# The session-start hook launches the default mode (detached) in every web session, so the
# stack is live before the work starts. Each step is written to
# $AGENT_STACK_DIR/status (default /tmp/agent-stack) as it runs, with the full log beside it;
# a lock keeps two bring-ups from racing; a re-run is safe (live services are kept).
# `pnpm dev:stack:status` / `pnpm dev:stack:stop` (tooling/setup/agent/stack.sh).
#
# `--install-only` stops before Docker: the setup phase is cached as files only (no
# running containers survive it), and a Docker failure there would mark the whole
# environment as failed. Tool installs are best-effort and log ✓/skip without aborting;
# dependencies, the env scaffold, DB bring-up, migrate, seed and the API/worker health
# checks are HARD gates (non-zero exit on failure).
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
readonly TOTAL=13
readonly DOCKERD_AGENT_MODE_FILE="${DOCKERD_AGENT_MODE_FILE:-/tmp/dockerd-agent-mode}"
readonly STACK_DIR="${AGENT_STACK_DIR:-/tmp/agent-stack}"
start_ts=$(date +%s)

# The step that is running (or failed, or "live") — read by `pnpm dev:stack:status`.
record_status() {
  [ "${live}" = 1 ] || return 0
  printf '%s  %s\n' "$(date -u '+%H:%M:%SZ')" "$*" > "${STACK_DIR}/status"
}

step() { echo ""; echo "▶ $*"; record_status "running ${*}"; }
ok()   { echo "✓ $*"; }
skip() { echo "• $*"; }
die()  { echo "✗ $*" >&2; record_status "failed — ${*}"; exit 1; }

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
}

# One bring-up at a time (a session resume, or a manual run while the hook's runs). A lock
# whose holder is gone — or from another boot, carried in by a cached environment — is stale.
# shellcheck source=tooling/setup/agent/stack-lock.lib.sh
source "${AGENT_DIR}/stack-lock.lib.sh"
if [ "${live}" = 1 ]; then
  mkdir -p "${STACK_DIR}"
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
  trap 'rm -f "${STACK_DIR}/lock/pid" "${STACK_DIR}/lock/boot_id"; rmdir "${STACK_DIR}/lock" 2>/dev/null' EXIT
fi

echo "cloud bring-up — $(date -u '+%Y-%m-%d %H:%M:%SZ')$([ "${install_only}" = 1 ] && echo ' (install only)')"

# Tools installed per-user (headroom via pip, codegraph via npm) land here. Appended, not
# prepended: other tools drop their own `node` into ~/.local/bin, which must not shadow the
# pinned or nvm Node.
export PATH="${PATH}:${HOME}/.local/bin"

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
# SessionStart hook (agent-os/hooks/be-session-start.sh) does the same switch for
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

# 2-8) The installs — skipped by --reset-database, which only brings the stack up again on a
# fresh database (the tools, the dependencies and the local env file are already in place), and
# by a live run after an install that finished with the same inputs: the cached Setup script, or
# an earlier bring-up in this container. Redoing them costs minutes, and step 4 restarts dockerd,
# which stops every running container. The stamp hashes what the installs depend on (the Node
# version, .nvmrc, the lockfile, .env.example and every script in this directory, pins
# included), so a changed input runs them again.
install_stamp_file="node_modules/.agent-install-stamp"
install_stamp() {
  { node -v; cat .nvmrc pnpm-lock.yaml .env.example "${AGENT_DIR}"/*.sh 2>/dev/null; } \
    | { sha256sum 2>/dev/null || shasum -a 256; } | cut -d' ' -f1
}
installs_cached=0
if [ "${live}" = 1 ] && [ "${reset_database}" = 0 ] \
  && [ -f "${install_stamp_file}" ] && [ "$(cat "${install_stamp_file}")" = "$(install_stamp)" ]; then
  installs_cached=1
fi

if [ "${reset_database}" = 0 ] && [ "${installs_cached}" = 0 ]; then
  # 2) Dependencies ------------------------------------------------------------
  step "[2/${TOTAL}] Dependencies (pnpm install)"
  # A fresh image may have Node without pnpm: corepack provides the version package.json pins.
  command -v pnpm >/dev/null 2>&1 \
    || corepack enable --install-directory "$(dirname "$(command -v node)")" 2>/dev/null \
    || corepack enable 2>/dev/null || true
  pnpm install --frozen-lockfile >&2 || die "pnpm install failed"
  ok "[2/${TOTAL}] dependencies installed"

  # 3) GitHub CLI --------------------------------------------------------------
  step "[3/${TOTAL}] GitHub CLI (gh)"
  bash "${AGENT_DIR}/install-gh.sh" || true
  if command -v gh >/dev/null 2>&1; then ok "[3/${TOTAL}] $(gh --version | head -1)"; else skip "[3/${TOTAL}] gh unavailable (non-fatal)"; fi

  # 4) Docker + images via registry mirror ------------------------------------
  step "[4/${TOTAL}] Docker CLI/Compose + images (mirror + pull)"
  bash "${AGENT_DIR}/install-docker.sh" || true
  bash "${AGENT_DIR}/install-docker-images.sh" || true
  if docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -qE '^postgres:|^redis:'; then
    ok "[4/${TOTAL}] compose images present: $(docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^postgres:|^redis:' | paste -sd' ' -)"
  else
    skip "[4/${TOTAL}] images not pre-pulled (compose will pull via mirror)"
  fi

  # 5) CodeGraph CLI + index ---------------------------------------------------
  step "[5/${TOTAL}] CodeGraph CLI + index"
  bash "${AGENT_DIR}/install-codegraph.sh" || true
  if command -v codegraph >/dev/null 2>&1; then ok "[5/${TOTAL}] codegraph $(codegraph --version 2>/dev/null)"; else skip "[5/${TOTAL}] codegraph unavailable (non-fatal)"; fi

  # 6) Headroom CLI + the default MCP pair (context compression) + session hooks -----
  # A session that holds several repositories reads hooks only from the parent directory's
  # .claude/settings.json; agent-os:session-hooks writes every repository's there (a no-op in
  # a single-repository checkout).
  step "[6/${TOTAL}] Headroom CLI + default MCP pair + session hooks"
  bash "${AGENT_DIR}/install-headroom.sh" || true
  pnpm mcp:setup:default >&2 || skip "mcp:setup:default failed (non-fatal)"
  pnpm agent-os:session-hooks >&2 || skip "agent-os:session-hooks failed (non-fatal)"
  if command -v headroom >/dev/null 2>&1; then ok "[6/${TOTAL}] headroom $(headroom --version 2>/dev/null)"; else skip "[6/${TOTAL}] headroom unavailable (non-fatal)"; fi

  # 7) gitleaks (pre-commit secret scan) + semgrep (security:sast) + k6 (load:*) --
  step "[7/${TOTAL}] gitleaks + semgrep + k6 (secret scan, SAST, load tests)"
  bash "${AGENT_DIR}/install-gitleaks.sh" || true
  bash "${AGENT_DIR}/install-semgrep.sh" || true
  bash "${AGENT_DIR}/install-k6.sh" || true
  if command -v gitleaks >/dev/null 2>&1; then ok "[7/${TOTAL}] gitleaks $(gitleaks version 2>/dev/null)"; else skip "[7/${TOTAL}] gitleaks unavailable — pre-commit secret scan will fail (non-fatal)"; fi
  if command -v semgrep >/dev/null 2>&1; then ok "[7/${TOTAL}] semgrep $(semgrep --version 2>/dev/null)"; else skip "[7/${TOTAL}] semgrep unavailable — pnpm security:sast will fail (non-fatal)"; fi
  if command -v k6 >/dev/null 2>&1; then ok "[7/${TOTAL}] $(k6 version 2>/dev/null | head -1)"; else skip "[7/${TOTAL}] k6 unavailable — pnpm load:* will fail (non-fatal)"; fi
  # Every tool against its pin in tool-versions.sh, the default MCP servers started for real
  # (initialize + tools/list), and the newer releases waiting — report only: a bump is a PR.
  if pnpm tool:agent-tools --smoke --outdated >&2; then
    ok "[7/${TOTAL}] agent tools at their pins; MCP servers answer"
  else
    skip "[7/${TOTAL}] agent tools: one is off its pin or failed its MCP smoke test — see the report above (non-fatal)"
  fi

  # 8) Environment files (.env.local) -----------------------------------------
  step "[8/${TOTAL}] Environment (.env.local)"
  pnpm setup:local --only-env >&2 || die "env scaffold failed (pnpm setup:local --only-env)"
  ok "[8/${TOTAL}] .env.local ready"
  install_stamp > "${install_stamp_file}" 2>/dev/null || true

  if [ "${install_only}" = 1 ]; then
    echo ""
    echo "✓ install complete in $(( $(date +%s) - start_ts ))s — in the session, run \`bash tooling/setup/agent/bootstrap.sh\` to bring up Postgres + Redis and the app."
    exit 0
  fi
elif [ "${installs_cached}" = 1 ]; then
  skip "[2-8/${TOTAL}] installs skipped — done with the same inputs (${install_stamp_file})"
  # Step 5's index refresh is the one part that follows the code, not the inputs.
  if command -v codegraph >/dev/null 2>&1 && [ -d .codegraph ]; then
    codegraph sync >&2 2>&1 || skip "codegraph sync failed (non-fatal)"
  fi
else
  skip "[2-8/${TOTAL}] installs skipped (--reset-database)"
fi

# 9) Postgres + Redis (docker compose) --------------------------------------
step "[9/${TOTAL}] Postgres + Redis (docker compose)"
bash "${AGENT_DIR}/ensure-docker-daemon.sh" >&2 || die "Docker daemon is not reachable (see ensure-docker-daemon diagnostics above)"

compose_cloud_stack() {
  docker compose -f docker-compose.yml -f "${AGENT_DIR}/docker-compose.cloud-agent.yml" up -d postgres redis
}

docker_mode="$(cat "${DOCKERD_AGENT_MODE_FILE}" 2>/dev/null || true)"
compose_ok=0
case "${docker_mode}" in
  restricted*)
    echo "bootstrap: Docker daemon is in ${docker_mode} mode; using cloud-agent host-network compose override." >&2
    compose_cloud_stack >&2 && compose_ok=1
    ;;
  *)
    SONAR=0 pnpm compose:up >&2 && compose_ok=1
    ;;
esac

if [ "${compose_ok}" -eq 0 ]; then
  echo "bootstrap: standard compose failed — retrying with restricted VFS + cloud-agent override." >&2
  FORCE_RESTRICTED_VFS=1 bash "${AGENT_DIR}/ensure-docker-daemon.sh" >&2 \
    || die "restricted Docker fallback failed (see ensure-docker-daemon diagnostics above)"
  compose_cloud_stack >&2 || die "compose:up failed with cloud-agent restricted Docker override"
fi

pnpm compose:wait >&2 || die "Postgres did not become ready"
ok "[9/${TOTAL}] Postgres + Redis healthy"

# --reset-database: the API and worker hold connections, so they stop first; the database step
# below then drops and recreates the database (`--reset`, which refuses one that is not local).
if [ "${reset_database}" = 1 ]; then
  step "[9/${TOTAL}] Stop the API + worker for the reset (--reset-database)"
  bash "${AGENT_DIR}/stack.sh" stop >&2
  ok "[9/${TOTAL}] API + worker stopped"
fi

# 10) The database: create, migrate, the logins the migrations create ---------
step "[10/${TOTAL}] Database: create, migrate, logins (pnpm db:migrate)"
if [ "${reset_database}" = 1 ]; then
  pnpm db:migrate --reset >&2 || die "db:migrate --reset failed"
else
  pnpm db:migrate >&2 || die "db:migrate failed"
fi
ok "[10/${TOTAL}] database migrated, logins enabled"

# 11) Seed, with the API and worker already starting -------------------------
# Neither needs the demo data to boot, so both start before the seed and their start-up
# overlaps it. "live" still waits for the seed and both health checks (steps 12 and 13).
worker_url="http://127.0.0.1:${WORKER_HEALTH_PORT:-9090}"
api_was_live=0; worker_was_live=0
if HEALTHCHECK_RETRIES=1 bash "${AGENT_DIR}/healthcheck.sh" >/dev/null 2>&1; then
  api_was_live=1
else
  start_detached api pnpm dev
fi
if HEALTHCHECK_URL="${worker_url}" HEALTHCHECK_RETRIES=1 bash "${AGENT_DIR}/healthcheck.sh" >/dev/null 2>&1; then
  worker_was_live=1
else
  start_detached worker pnpm dev:worker
fi

# The full demo set — it includes the minimal reference data and upserts, so a re-run is safe.
step "[11/${TOTAL}] Seed (full demo data; API + worker starting alongside)"
pnpm db:seed:full >&2 || die "db:seed:full failed"
ok "[11/${TOTAL}] seed complete"

# 12) API — started in its own session above and left running -----------------
step "[12/${TOTAL}] API live (/livez + /readyz)"
if [ "${api_was_live}" = 1 ]; then
  ok "[12/${TOTAL}] API already live on :${PORT:-3000}"
else
  if ! bash "${AGENT_DIR}/healthcheck.sh"; then
    echo "---- pnpm dev log (tail) ----" >&2
    tail -20 "${STACK_DIR}/api.log" >&2
    die "API healthcheck failed (log: ${STACK_DIR}/api.log)"
  fi
  ok "[12/${TOTAL}] API live on :${PORT:-3000} (kept running)"
fi

# 13) Worker (BullMQ) — its own /livez + /readyz on WORKER_HEALTH_PORT ---------
step "[13/${TOTAL}] Worker live (${worker_url}/readyz)"
if [ "${worker_was_live}" = 1 ]; then
  ok "[13/${TOTAL}] worker already live"
else
  if ! HEALTHCHECK_URL="${worker_url}" bash "${AGENT_DIR}/healthcheck.sh"; then
    echo "---- pnpm dev:worker log (tail) ----" >&2
    tail -20 "${STACK_DIR}/worker.log" >&2
    die "worker healthcheck failed (log: ${STACK_DIR}/worker.log)"
  fi
  ok "[13/${TOTAL}] worker live (kept running)"
fi

api_url="http://127.0.0.1:${PORT:-3000}"
# curl prints 000 itself when nothing answers.
route_state() { curl -s -o /dev/null -m 3 -w '%{http_code}' "$1" 2>/dev/null || true; }
record_status "live — API ${api_url} · worker ${worker_url}"
echo ""
echo "✓ playground live in $(( $(date +%s) - start_ts ))s"
echo "  API          ${api_url}   (/livez · /readyz)"
echo "  API docs     ${api_url}/reference      [HTTP $(route_state "${api_url}/reference")]"
echo "  Queues       ${api_url}/admin/queues   [HTTP $(route_state "${api_url}/admin/queues")]"
echo "  Worker       ${worker_url}/readyz"
echo "  Demo login   demo@example.com — set DEMO_PASSWORD on the environment for a known password"
echo "  Logs         ${STACK_DIR}/{bootstrap,api,worker}.log"
echo "  Status/stop  pnpm dev:stack:status · pnpm dev:stack:stop"
