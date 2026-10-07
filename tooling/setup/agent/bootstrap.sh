#!/usr/bin/env bash
# The one cloud-agent setup script: install everything, then bring the stack up.
#
# Installs — Node (into /opt, as root or via passwordless sudo), dependencies, gh, Docker
# CLI/Compose, Docker images (registry mirror), CodeGraph, Headroom + the default MCP pair,
# gitleaks — and scaffolds a self-contained `.env.local` (`pnpm setup:local --only-env`,
# which first stops on a DATABASE_*_URL in the environment that is remote or the wrong
# login, or a remote REDIS_URL). Then brings up the local Docker stack (Postgres + Redis),
# migrates, enables the database logins the migrations create (`pnpm setup:local
# --only-env` again), seeds, and verifies the app is healthy (/livez + /readyz). A progress
# log after each step shows anyone watching the session live status.
#
#   bash tooling/setup/agent/bootstrap.sh                 # in the session: everything
#   bash tooling/setup/agent/bootstrap.sh --install-only  # environment Setup / install
#                                                         # script: steps 1-8, cached
#
# `--install-only` stops before Docker: the setup phase is cached as files only (no
# running containers survive it), and a Docker failure there would mark the whole
# environment as failed. Tool installs are best-effort and log ✓/skip without aborting;
# dependencies, the env scaffold, DB bring-up, migrate, seed and healthcheck are HARD
# gates (non-zero exit on failure). Leaves Postgres + Redis running. The app is started
# only transiently for the healthcheck and then stopped — set KEEP_APP=1 to leave
# `pnpm dev` up.
set -uo pipefail

install_only=0
for argument in "$@"; do
  case "${argument}" in
    --install-only) install_only=1 ;;
    *) echo "✗ unknown option: ${argument} (only --install-only)" >&2; exit 2 ;;
  esac
done

cd "$(dirname "${BASH_SOURCE[0]}")/../../.." || exit 1
readonly AGENT_DIR="tooling/setup/agent"
readonly TOTAL=12
readonly DOCKERD_AGENT_MODE_FILE="${DOCKERD_AGENT_MODE_FILE:-/tmp/dockerd-agent-mode}"
start_ts=$(date +%s)

step() { echo ""; echo "▶ $*"; }
ok()   { echo "✓ $*"; }
skip() { echo "• $*"; }
die()  { echo "✗ $*" >&2; exit 1; }

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

# Stop the dev server this script started and everything it spawned. The whole tree
# is collected before anything is signalled, so no child is orphaned and missed, and
# nothing outside it (another checkout's `tsx watch`) is touched.
stop_app() {
  local pids
  pids="$(descendant_pids "$1") $1"
  # shellcheck disable=SC2086 # one PID per word
  kill -TERM ${pids} 2>/dev/null || true
}

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
# The pinned Node goes to <prefix>/node<major>, which needs root: run as root, else via
# passwordless sudo and then hand the directory to this user (so corepack/pnpm can write
# shims without sudo), else best-effort on the session Node. Off Linux, install-node.sh
# exits early — a developer machine's Node comes from nvm.
if [ "$(id -u)" -eq 0 ] || [ "$(uname -s)" != "Linux" ]; then
  NODE_INSTALL_PREFIX="${node_prefix}" bash "${AGENT_DIR}/install-node.sh" >&2 \
    || skip "install-node best-effort (using session Node)"
elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  sudo -n env NODE_INSTALL_PREFIX="${node_prefix}" bash "${AGENT_DIR}/install-node.sh" >&2 \
    && sudo -n chown -R "$(id -u):$(id -g)" "${node_prefix}/node${required_major}" 2>/dev/null \
    || skip "install-node best-effort (using session Node)"
else
  skip "install-node: ${node_prefix} needs root and passwordless sudo is unavailable — using session Node"
fi

# install-node.sh drops the pinned Node into <prefix>/node<major>, but it runs
# in a child process and so cannot change THIS shell's PATH. Activate it here so
# every pnpm step below runs on the pinned Node; otherwise the image default
# (e.g. Node 22) trips pnpm's engineStrict gate at the compose:up step. The
# SessionStart hook (agent-os/hooks/session-start.sh) does the same switch for
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

# 6) Headroom CLI + the default MCP pair (context compression) --------------
step "[6/${TOTAL}] Headroom CLI + default MCP pair"
bash "${AGENT_DIR}/install-headroom.sh" || true
pnpm mcp:setup:default >&2 || skip "mcp:setup:default failed (non-fatal)"
if command -v headroom >/dev/null 2>&1; then ok "[6/${TOTAL}] headroom $(headroom --version 2>/dev/null)"; else skip "[6/${TOTAL}] headroom unavailable (non-fatal)"; fi

# 7) gitleaks (pre-commit secret scan) --------------------------------------
step "[7/${TOTAL}] gitleaks (secret scan)"
bash "${AGENT_DIR}/install-gitleaks.sh" || true
if command -v gitleaks >/dev/null 2>&1; then ok "[7/${TOTAL}] gitleaks $(gitleaks version 2>/dev/null)"; else skip "[7/${TOTAL}] gitleaks unavailable — pre-commit secret scan will fail (non-fatal)"; fi

# 8) Environment files (.env.local) -----------------------------------------
step "[8/${TOTAL}] Environment (.env.local)"
pnpm setup:local --only-env >&2 || die "env scaffold failed (pnpm setup:local --only-env)"
ok "[8/${TOTAL}] .env.local ready"

if [ "${install_only}" = 1 ]; then
  echo ""
  echo "✓ install complete in $(( $(date +%s) - start_ts ))s — in the session, run \`bash tooling/setup/agent/bootstrap.sh\` to bring up Postgres + Redis and the app."
  exit 0
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

# 10) Migrations + database logins --------------------------------------------
step "[10/${TOTAL}] Database migrations + logins"
pnpm db:migrate >&2 || die "db:migrate failed"
# Step 7 ran before Postgres was up, so it could not turn on the logins the
# migrations just created NOLOGIN. Re-run it now (the same order `pnpm setup:local`
# uses): otherwise a fresh database with a `.env.local` that already carries the
# login URLs fails the seed, and a fresh `.env.local` leaves the app on the superuser.
pnpm setup:local --only-env >&2 || die "database logins failed (pnpm setup:local --only-env)"
ok "[10/${TOTAL}] migrations applied, database logins enabled"

# 11) Seed -------------------------------------------------------------------
step "[11/${TOTAL}] Seed (minimal reference data)"
pnpm db:seed >&2 || die "db:seed failed"
ok "[11/${TOTAL}] seed complete"

# 12) App health (/livez + /readyz) -----------------------------------------
step "[12/${TOTAL}] App health (/livez + /readyz)"
app_log="$(mktemp)"
pnpm dev >"${app_log}" 2>&1 &
app_pid=$!
if bash "${AGENT_DIR}/healthcheck.sh"; then
  ok "[12/${TOTAL}] app live & ready"
  app_ok=1
else
  echo "---- pnpm dev log (tail) ----" >&2
  tail -20 "${app_log}" >&2
  app_ok=0
fi

if [ "${KEEP_APP:-0}" = "1" ] && [ "${app_ok}" = "1" ]; then
  echo "  KEEP_APP=1 — leaving \`pnpm dev\` running on :${PORT:-3000}." >&2
else
  stop_app "${app_pid}"
  echo "  stopped transient app (Postgres + Redis stay up)." >&2
fi
rm -f "${app_log}"
[ "${app_ok}" = "1" ] || die "healthcheck failed"

echo ""
echo "✓ bring-up complete in $(( $(date +%s) - start_ts ))s — session matches local. Postgres + Redis are up; run \`pnpm dev\` when you need the app."
