#!/usr/bin/env bash
# shellcheck shell=bash
# A live bring-up's lock (`<stack directory>/lock/`), status line (`<stack directory>/status`)
# and timeline. The backend's bootstrap.sh takes the lock and writes the status and the timeline
# in $AGENT_STACK_DIR, its stack.sh reports and waits on them, and its session-start hook decides
# whether to launch a bring-up. The frontend's bootstrap.sh and session-start hook use the lock
# alone, in $AGENT_STACK_DIR/frontend, so the two repositories' bring-ups never wait on each
# other. Identical in both repositories (the mirrored-files policy test).
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

# The status line has the same problem as the lock: a container paused after "live" resumes with
# the file saying "live" and none of the processes running. So each line is stamped with the boot
# it was written in, and a line from another boot reads as no status at all.

# stack_status_write STACK_DIR TEXT — records the bring-up's state ("running …", "failed — …",
# "live — …", "stopped — …") as one line, stamped with this boot.
stack_status_write() {
  printf '%s  %s\n' "$(date -u '+%H:%M:%SZ')" "$2" > "$1/status"
  stack_boot_id > "$1/status.boot_id"
}

# stack_status_line STACK_DIR — prints the state line and returns 0 when it was written in this
# boot; returns 1 when there is none or it is from another boot.
stack_status_line() {
  local boot
  [ -f "$1/status" ] || return 1
  boot="$(cat "$1/status.boot_id" 2>/dev/null || true)"
  [ "${boot}" = "$(stack_boot_id)" ] || return 1
  cat "$1/status"
}

# stack_status_state LINE — the state word of a status line: running, failed, live or stopped.
stack_status_state() {
  printf '%s\n' "$1" | awk '{ print $2 }'
}

# The timeline: when each step of a bootstrap.sh run started and how it ended, and each process it
# launched, one line each, stamped with the UTC date and time. A live bring-up writes
# `$AGENT_STACK_DIR/timeline`, stamped with its boot like the status line. The environment's Setup
# script (bootstrap.sh --install-only) writes `setup-timeline-<repository>` in the directory below,
# outside /tmp, so the record is cached with the installs it describes and both repositories' runs
# sit side by side.

# stack_setup_timeline_directory — where each repository's Setup-script timeline is kept.
stack_setup_timeline_directory() {
  printf '%s\n' "${AGENT_SETUP_TIMELINE_DIR:-${XDG_CACHE_HOME:-${HOME}/.cache}/agent-stack}"
}

# stack_timeline_start FILE — starts an empty timeline, stamped with this boot.
stack_timeline_start() {
  : > "$1" 2>/dev/null || true
  stack_boot_id > "$1.boot_id" 2>/dev/null || true
}

# stack_timeline_append FILE TEXT — adds one stamped line; a timeline that cannot be written never
# stops the run it records.
stack_timeline_append() {
  printf '%s  %s\n' "$(date -u '+%Y-%m-%d %H:%M:%SZ')" "$2" >> "$1" 2>/dev/null || true
}

# stack_timeline_this_boot FILE — prints the timeline and returns 0 when it was started in this
# boot; returns 1 when there is none or it is from another boot.
stack_timeline_this_boot() {
  [ -s "$1" ] || return 1
  [ "$(cat "$1.boot_id" 2>/dev/null || true)" = "$(stack_boot_id)" ] || return 1
  cat "$1"
}
