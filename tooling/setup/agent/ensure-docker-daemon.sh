#!/usr/bin/env bash
# Ensure the Docker daemon is reachable before running docker compose.
#
# The one way tooling starts Docker. On a Mac it starts OrbStack or Docker Desktop
# (whichever is installed) and waits for it. Cloud agent images can have the Docker
# CLI installed while dockerd is stopped: there it starts dockerd when possible, waits
# for the socket, and prints useful diagnostics when the platform does not permit
# nested Docker. Identical in clinozy-fe.
set -uo pipefail

readonly LOG_FILE="${DOCKERD_AGENT_LOG:-/tmp/dockerd-agent.log}"
readonly MODE_FILE="${DOCKERD_AGENT_MODE_FILE:-/tmp/dockerd-agent-mode}"
readonly PROBE_LOG_FILE="${DOCKERD_AGENT_PROBE_LOG:-/tmp/docker-agent-probe.log}"
readonly PROBE_IMAGE="${DOCKERD_AGENT_PROBE_IMAGE:-hello-world:latest}"
readonly VFS_DATA_ROOT="${DOCKERD_AGENT_VFS_DATA_ROOT:-/tmp/docker-agent-vfs}"

log() {
  printf 'ensure-docker-daemon: %s\n' "$*" >&2
}

# True while a dockerd process is alive. One that has not answered yet is still starting, not
# failed: a second dockerd started beside it stops on the first one's pid file.
dockerd_running() {
  pgrep -x dockerd >/dev/null 2>&1
}

wait_for_docker() {
  for _ in $(seq 1 "${DOCKERD_WAIT_SECONDS:-30}"); do
    docker info >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

# True once a dockerd process exists, polled for DOCKERD_APPEAR_SECONDS (default 5). A service
# manager that starts the daemon has a process up within a second; one that returns with nothing
# behind it (a cloud container's `service docker start`) is given up on here, not after the full
# DOCKERD_WAIT_SECONDS — that wait, once for `service` and once for `systemctl`, cost a cold
# start about 60 s.
dockerd_appeared() {
  for _ in $(seq 1 "${DOCKERD_APPEAR_SECONDS:-5}"); do
    dockerd_running && return 0
    sleep 1
  done
  return 1
}

# A resumed container keeps /var/run but none of its processes, so the pid files of dockerd and
# of the containerd it manages can name a pid that something else holds after the reboot (a
# kernel worker, a shell). dockerd then refuses to start ("process with PID … is still running"),
# or waits for a containerd that is not there until it times out. A pid file whose pid does not
# run the program it belongs to is stale, and is removed before any dockerd is started.
clear_stale_pid_file() { # $1 = pid file, $2 = the program its pid must run
  local pid
  [ -f "$1" ] || return 0
  pid="$(cat "$1" 2>/dev/null || true)"
  if [ -n "${pid}" ] && [ "$(ps -p "${pid}" -o comm= 2>/dev/null)" = "$2" ]; then
    return 0
  fi
  log "removing stale $1 (pid ${pid:-none} is not a running $2)."
  if [ "${#sudo_cmd[@]}" -gt 0 ]; then
    "${sudo_cmd[@]}" rm -f "$1" 2>/dev/null || true
  else
    rm -f "$1" 2>/dev/null || true
  fi
}

clear_stale_pid_files() {
  clear_stale_pid_file /var/run/docker.pid dockerd
  clear_stale_pid_file /var/run/docker/containerd/containerd.pid containerd
}

start_dockerd() {
  local mode="$1"
  shift

  clear_stale_pid_files
  log "starting dockerd ${mode}; log: ${LOG_FILE}"
  : >"${LOG_FILE}"
  if [ "${#sudo_cmd[@]}" -gt 0 ]; then
    setsid "${sudo_cmd[@]}" dockerd "$@" >"${LOG_FILE}" 2>&1 </dev/null &
  else
    setsid dockerd "$@" >"${LOG_FILE}" 2>&1 </dev/null &
  fi
}

stop_dockerd() {
  log "stopping existing dockerd before fallback restart."
  if command -v service >/dev/null 2>&1; then
    if [ "${#sudo_cmd[@]}" -gt 0 ]; then
      "${sudo_cmd[@]}" service docker stop >/dev/null 2>&1 || true
    else
      service docker stop >/dev/null 2>&1 || true
    fi
  fi

  if command -v systemctl >/dev/null 2>&1; then
    if [ "${#sudo_cmd[@]}" -gt 0 ]; then
      "${sudo_cmd[@]}" systemctl stop docker >/dev/null 2>&1 || true
    else
      systemctl stop docker >/dev/null 2>&1 || true
    fi
  fi

  if [ "${#sudo_cmd[@]}" -gt 0 ]; then
    "${sudo_cmd[@]}" pkill -TERM dockerd >/dev/null 2>&1 || true
  else
    pkill -TERM dockerd >/dev/null 2>&1 || true
  fi

  # Wait for the process, not the API: dockerd stops answering at once but exits only after it
  # has stopped its containers, and a dockerd started before then stops on its pid file.
  for _ in $(seq 1 30); do
    dockerd_running || return 0
    sleep 1
  done
}

probe_docker_layer_extract() {
  : >"${PROBE_LOG_FILE}"

  if docker image inspect "${PROBE_IMAGE}" >/dev/null 2>&1; then
    return 0
  fi

  if docker pull "${PROBE_IMAGE}" >"${PROBE_LOG_FILE}" 2>&1; then
    return 0
  fi

  if grep -Eiq 'operation not permitted|failed to (mount|unmount|extract layer)|overlayfs|snapshotter' "${PROBE_LOG_FILE}"; then
    return 2
  fi

  log "Docker layer extraction probe could not pull ${PROBE_IMAGE}; compose may still pull cached/project images."
  if [ -s "${PROBE_LOG_FILE}" ]; then
    tail -20 "${PROBE_LOG_FILE}" >&2 || true
  fi
  return 1
}

start_restricted_dockerd() {
  start_dockerd "with restricted networking fallback" \
    --iptables=false \
    --ip-masq=false \
    --ip-forward=false \
    --bridge=none
}

start_restricted_vfs_dockerd() {
  mkdir -p "${VFS_DATA_ROOT}" 2>/dev/null || true
  start_dockerd "with restricted networking and vfs storage fallback" \
    --iptables=false \
    --ip-masq=false \
    --ip-forward=false \
    --bridge=none \
    --storage-driver=vfs \
    --data-root="${VFS_DATA_ROOT}"
}

# A developer Mac: OrbStack or Docker Desktop owns the daemon.
if [ "$(uname -s)" = "Darwin" ]; then
  docker info >/dev/null 2>&1 && exit 0
  if command -v orb >/dev/null 2>&1; then
    log "starting OrbStack…"
    orb start >/dev/null 2>&1 || true
    docker context use orbstack >/dev/null 2>&1 || true
  elif [ -d /Applications/Docker.app ]; then
    log "starting Docker Desktop…"
    open -a Docker >/dev/null 2>&1 || true
  else
    log "no Docker runtime — install OrbStack or Docker Desktop (pnpm setup:mac-tools)."
    exit 1
  fi
  DOCKERD_WAIT_SECONDS="${DOCKERD_WAIT_SECONDS:-60}" wait_for_docker && exit 0
  log "Docker did not come up within ${DOCKERD_WAIT_SECONDS:-60} seconds."
  exit 1
fi

sudo_cmd=()
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    sudo_cmd=(sudo -n)
  fi
fi

# bootstrap.sh sets this when overlay/cgroup compose fails on an otherwise "healthy" daemon.
if [ "${FORCE_RESTRICTED_VFS:-0}" = "1" ] && command -v dockerd >/dev/null 2>&1; then
  log "forcing restricted VFS Docker mode (FORCE_RESTRICTED_VFS=1)."
  stop_dockerd
  start_restricted_vfs_dockerd
  if [ -S /var/run/docker.sock ] && [ "${#sudo_cmd[@]}" -gt 0 ]; then
    "${sudo_cmd[@]}" chmod a+rw /var/run/docker.sock >/dev/null 2>&1 || true
  fi
  if wait_for_docker; then
    printf 'restricted-vfs\n' >"${MODE_FILE}"
    log "Docker daemon is reachable with forced restricted VFS mode."
    exit 0
  fi
  log "forced restricted VFS Docker mode failed."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  log "docker CLI is not installed."
  exit 1
fi

if docker info >/dev/null 2>&1; then
  log "Docker daemon already reachable; probing image layer extraction."
  probe_docker_layer_extract
  probe_status=$?
  if [ "${probe_status}" -eq 0 ]; then
    log "Docker daemon already usable."
    rm -f "${MODE_FILE}" 2>/dev/null || true
    exit 0
  fi

  if [ "${probe_status}" -eq 2 ] && command -v dockerd >/dev/null 2>&1; then
    stop_dockerd
    start_restricted_vfs_dockerd
    if wait_for_docker && probe_docker_layer_extract; then
      printf 'restricted-vfs\n' >"${MODE_FILE}"
      log "Docker daemon is reachable with restricted networking and vfs storage fallback."
      exit 0
    fi
  fi

  log "Docker daemon is reachable; continuing without storage fallback."
  rm -f "${MODE_FILE}" 2>/dev/null || true
  exit 0
fi

log "Docker daemon is not reachable; attempting to start it."

# The service script starts dockerd with the same pid file, so it is cleared for that start too.
dockerd_running || clear_stale_pid_files

if command -v service >/dev/null 2>&1; then
  if [ "${#sudo_cmd[@]}" -gt 0 ]; then
    "${sudo_cmd[@]}" service docker start >/dev/null 2>&1 || true
  else
    service docker start >/dev/null 2>&1 || true
  fi
  if dockerd_appeared; then
    wait_for_docker || true
  else
    log "service docker start left no dockerd running; moving on."
  fi
fi

# systemctl only where systemd runs (/run/systemd/system): elsewhere it can start nothing.
if ! docker info >/dev/null 2>&1 && ! dockerd_running && [ -d /run/systemd/system ] \
  && command -v systemctl >/dev/null 2>&1; then
  if [ "${#sudo_cmd[@]}" -gt 0 ]; then
    "${sudo_cmd[@]}" systemctl start docker >/dev/null 2>&1 || true
  else
    systemctl start docker >/dev/null 2>&1 || true
  fi
  if dockerd_appeared; then
    wait_for_docker || true
  fi
fi

# Not beside a dockerd the service is still starting.
if ! docker info >/dev/null 2>&1 && command -v dockerd >/dev/null 2>&1 && ! dockerd_running; then
  start_dockerd "directly"
fi

if wait_for_docker; then
  log "Docker daemon is reachable; probing image layer extraction."
  probe_docker_layer_extract
  probe_status=$?
  if [ "${probe_status}" -eq 0 ]; then
    log "Docker daemon is usable."
    rm -f "${MODE_FILE}" 2>/dev/null || true
    exit 0
  fi
  if [ "${probe_status}" -eq 2 ] && command -v dockerd >/dev/null 2>&1; then
    stop_dockerd
    start_restricted_vfs_dockerd
    if wait_for_docker && probe_docker_layer_extract; then
      printf 'restricted-vfs\n' >"${MODE_FILE}"
      log "Docker daemon is reachable with restricted networking and vfs storage fallback."
      exit 0
    fi
  fi
  log "Docker daemon is reachable; continuing without storage fallback."
  rm -f "${MODE_FILE}" 2>/dev/null || true
  exit 0
fi

# Some ephemeral cloud images start dockerd with a root-owned socket that the
# current user cannot access until a fresh login. Relax only this ephemeral
# socket when passwordless sudo is available; compose must run as this user.
if [ -S /var/run/docker.sock ] && [ "${#sudo_cmd[@]}" -gt 0 ]; then
  "${sudo_cmd[@]}" chmod a+rw /var/run/docker.sock >/dev/null 2>&1 || true
fi

if wait_for_docker; then
  log "Docker daemon is reachable after socket permission repair; probing image layer extraction."
  probe_docker_layer_extract
  probe_status=$?
  if [ "${probe_status}" -eq 0 ]; then
    log "Docker daemon is usable after socket permission repair."
    rm -f "${MODE_FILE}" 2>/dev/null || true
    exit 0
  fi
  if [ "${probe_status}" -eq 2 ] && command -v dockerd >/dev/null 2>&1; then
    stop_dockerd
    start_restricted_vfs_dockerd
    if wait_for_docker && probe_docker_layer_extract; then
      printf 'restricted-vfs\n' >"${MODE_FILE}"
      log "Docker daemon is reachable with restricted networking and vfs storage fallback."
      exit 0
    fi
  fi
  log "Docker daemon is reachable after socket permission repair; continuing without storage fallback."
  rm -f "${MODE_FILE}" 2>/dev/null || true
  exit 0
fi

# A dockerd still alive by now is slow, not failed: on a just-booted machine it can take longer
# than the waits above. It gets three more waits as it is. A restricted dockerd started beside it
# would stop on its pid file, and the first one, answering later, would be recorded as the
# fallback, sending bootstrap.sh to the host-network override for a daemon that has its bridge.
if dockerd_running && DOCKERD_WAIT_SECONDS=$((${DOCKERD_WAIT_SECONDS:-30} * 3)) wait_for_docker; then
  log "Docker daemon is reachable after a slow start."
  rm -f "${MODE_FILE}" 2>/dev/null || true
  exit 0
fi

# Some cloud-agent setup containers can run as root but still lack the kernel
# capability Docker needs to program iptables/NAT for the default bridge:
# "failed to create NAT chain DOCKER ... Permission denied". In that case,
# start dockerd without bridge/NAT; bootstrap.sh detects this marker and uses a
# host-network compose override for Postgres + Redis. Only a dockerd started here
# is recorded as restricted.
if command -v dockerd >/dev/null 2>&1 && ! dockerd_running; then
  start_restricted_dockerd

  if wait_for_docker; then
    probe_docker_layer_extract
    probe_status=$?
    if [ "${probe_status}" -eq 0 ]; then
      printf 'restricted\n' >"${MODE_FILE}"
      log "Docker daemon is reachable with restricted networking fallback."
      exit 0
    fi
    if [ "${probe_status}" -eq 2 ]; then
      stop_dockerd
      start_restricted_vfs_dockerd
      if wait_for_docker && probe_docker_layer_extract; then
        printf 'restricted-vfs\n' >"${MODE_FILE}"
        log "Docker daemon is reachable with restricted networking and vfs storage fallback."
        exit 0
      fi
    fi
  fi
fi

log "Docker daemon still unreachable."
log "docker: $(docker --version 2>/dev/null || printf 'unavailable')"
log "dockerd: $(command -v dockerd 2>/dev/null || printf 'not found')"
if [ -e /var/run/docker.sock ]; then
  ls -l /var/run/docker.sock >&2 2>/dev/null || true
fi
if [ -s "${LOG_FILE}" ]; then
  log "dockerd log tail:"
  tail -50 "${LOG_FILE}" >&2 || true
fi
exit 1
