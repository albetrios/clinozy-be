#!/usr/bin/env bash
# Make the project's Docker Compose images pullable in Claude Code on the web
# (cloud agent) sessions, where Docker Hub's blob CDN is blocked.
#
# Why this exists: `pnpm compose:up` pulls the pinned `postgres:<v>-alpine` and
# `redis:<v>-alpine` images declared in docker-compose.yml. On the cloud image the
# Docker registry *manifest* host (registry-1.docker.io) is reachable, but the
# actual layer *blobs* are served from Docker Hub's CDN
# (production.cloudfront.docker.com) — which is NOT on the default network
# allowlist, so every pull dies with `403 Forbidden`. AWS ECR Public has the same
# problem (its blobs come from *.cloudfront.net).
#
# Fix: point the Docker daemon at Google's Docker Hub pull-through mirror
# (https://mirror.gcr.io), which IS reachable on the default allowlist and serves
# byte-identical images (same content digests). With the mirror configured,
# `docker pull postgres:<v>-alpine` resolves transparently — docker-compose.yml
# needs NO changes, so the cloud stack runs the SAME image you run locally.
#
# Usage: paste into the environment's *Setup script* field (runs as root, cached),
# AFTER install-node.sh:
#
#     bash tooling/setup/agent/install-node.sh
#     bash tooling/setup/agent/install-docker-images.sh
#
# It (a) writes the registry mirror into /etc/docker/daemon.json and (b) best-effort
# pre-pulls the compose images so the first in-session `pnpm compose:up` is instant
# (the Setup-script filesystem, including /var/lib/docker, is cached).
#
# Alternative (no script): add `production.cloudfront.docker.com` to the Network
# allowlist (Custom access) to pull straight from Docker Hub exactly like local.
#
# Idempotent and best-effort: never hard-fails the setup chain. Diagnostics → stderr.
set -uo pipefail

readonly MIRROR_URL="https://mirror.gcr.io"
readonly DAEMON_JSON="/etc/docker/daemon.json"

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
agent_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Wait up to ~30s for the Docker socket to become responsive.
wait_for_docker() {
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

# Start the Docker daemon the one way (ensure-docker-daemon.sh), so a freshly written daemon.json
# applies on its next start.
start_docker() {
  bash "${agent_dir}/ensure-docker-daemon.sh" && wait_for_docker
}

# Steps 1–2 are for the Linux cloud image, whose Docker Hub blob CDN is blocked. Docker Desktop
# and OrbStack on a developer machine pull straight from Docker Hub and own their daemon (there
# is no /etc/docker or dockerd to restart), so only the pre-pull in step 3 applies there.
if [ "$(uname -s)" = "Linux" ]; then
  # 1) Configure the registry mirror (merge-safe; preserve any existing config).
  mkdir -p /etc/docker 2>/dev/null || true
  if [ -f "${DAEMON_JSON}" ] && grep -q 'mirror.gcr.io' "${DAEMON_JSON}" 2>/dev/null; then
    echo "install-docker-images: registry mirror already present in ${DAEMON_JSON}." >&2
  elif command -v jq >/dev/null 2>&1 && [ -f "${DAEMON_JSON}" ]; then
    tmp="$(mktemp)"
    if jq --arg m "${MIRROR_URL}" \
         '."registry-mirrors" = ((."registry-mirrors" // []) + [$m] | unique)' \
         "${DAEMON_JSON}" > "${tmp}" 2>/dev/null && mv "${tmp}" "${DAEMON_JSON}" 2>/dev/null; then
      echo "install-docker-images: merged registry mirror into existing ${DAEMON_JSON}." >&2
    else
      rm -f "${tmp}"
      echo "install-docker-images: could not merge ${DAEMON_JSON} — leaving it untouched." >&2
    fi
  elif printf '{\n  "registry-mirrors": ["%s"]\n}\n' "${MIRROR_URL}" > "${DAEMON_JSON}" 2>/dev/null; then
    echo "install-docker-images: wrote ${DAEMON_JSON} with registry mirror ${MIRROR_URL}." >&2
  else
    echo "install-docker-images: cannot write ${DAEMON_JSON} (needs root — run in the Setup script) — pulls go straight to Docker Hub." >&2
  fi

  # 2) Ensure dockerd is running and has actually picked up the mirror.
  if ! docker info >/dev/null 2>&1; then
    echo "install-docker-images: starting dockerd…" >&2
    start_docker || true
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "install-docker-images: dockerd not reachable during setup — the mirror is written and will apply when dockerd next starts in-session." >&2
    exit 0
  fi

  if grep -q 'mirror.gcr.io' "${DAEMON_JSON}" 2>/dev/null && ! docker info 2>/dev/null | grep -q 'mirror.gcr.io'; then
    echo "install-docker-images: restarting dockerd to apply the mirror…" >&2
    RESTART_DOCKERD=1 start_docker || true
  fi
else
  echo "install-docker-images: $(uname -s) Docker pulls from Docker Hub directly — no mirror needed." >&2
fi

# 3) Pre-pull the exact images docker-compose.yml pins (stays in sync automatically).
if [ -f "${repository_root}/docker-compose.yml" ] && docker info >/dev/null 2>&1; then
  echo "install-docker-images: pre-pulling compose images…" >&2
  ( cd "${repository_root}" && docker compose pull postgres redis ) >&2 2>&1 \
    || echo "install-docker-images: pre-pull failed (non-fatal) — compose will pull on demand via the mirror." >&2
fi
# The SonarQube server + scanner the pre-commit gate runs (~1 GB): pulled here, in the cached
# Setup script, so the first commit that touches src/ does not wait on the download.
if [ -f "${repository_root}/docker-compose.sonar.yml" ] && docker info >/dev/null 2>&1; then
  echo "install-docker-images: pre-pulling the SonarQube gate images…" >&2
  ( cd "${repository_root}" && docker compose -f docker-compose.sonar.yml pull sonarqube scanner ) >&2 2>&1 \
    || echo "install-docker-images: SonarQube pre-pull failed (non-fatal) — the gate pulls on first use." >&2
fi

echo "install-docker-images: done." >&2
exit 0
