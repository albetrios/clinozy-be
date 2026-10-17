#!/usr/bin/env bash
# shellcheck shell=bash
# The live bring-up's lock (`$AGENT_STACK_DIR/lock/`), shared by bootstrap.sh (takes it),
# stack.sh (reports it) and agent-os/hooks/session-start.sh (decides whether to launch one).
#
# A lock outlives its bring-up when the container stops mid-run: the cached environment of
# a cloud session can carry a `lock/pid` from another boot, and that pid can name an
# unrelated process in the next container. So a lock counts as held only when its pid is
# alive, was written in this boot (Linux `boot_id`; skipped where there is none), and is
# still running bootstrap.sh. Anything else is stale and the next bring-up clears it.

# The kernel's id for this boot, or nothing off Linux.
stack_boot_id() {
  cat /proc/sys/kernel/random/boot_id 2>/dev/null || true
}

# stack_lock_holder STACK_DIR — prints the pid of the live bring-up holding the lock and
# returns 0; returns 1 when the lock is free or stale.
stack_lock_holder() {
  local lock="$1/lock" pid boot
  [ -d "${lock}" ] || return 1
  pid="$(cat "${lock}/pid" 2>/dev/null || true)"
  if [ -z "${pid}" ] || ! kill -0 "${pid}" 2>/dev/null; then return 1; fi
  boot="$(cat "${lock}/boot_id" 2>/dev/null || true)"
  if [ -n "${boot}" ] && [ "${boot}" != "$(stack_boot_id)" ]; then return 1; fi
  ps -p "${pid}" -o args= 2>/dev/null | grep -q 'bootstrap\.sh' || return 1
  echo "${pid}"
}

# stack_lock_write STACK_DIR — records this shell as the holder of a lock it just created.
stack_lock_write() {
  echo "$$" > "$1/lock/pid"
  stack_boot_id > "$1/lock/boot_id"
}
