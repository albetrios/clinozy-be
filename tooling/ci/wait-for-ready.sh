#!/usr/bin/env bash
# The one wait for an API to be ready — used by the start-api-server action, the image smoke boot
# (reusable-docker-build-trivy.yml) and the Railway deploy (reusable-railway-deploy.yml).
#
# Usage: tooling/ci/wait-for-ready.sh --url <url> --timeout <seconds>
#          [--interval <seconds>] [--pid-file <file>] [--output <file>]
#
# Polls <url> until it answers 2xx, every <interval> seconds (default 2), for at most <timeout>
# seconds. With --pid-file it stops at once when that process has exited (it will never become
# ready); with --output the last answer's body is written there. Exits 0 when ready, 1 when not;
# the caller prints its own diagnostics (a log tail, the deploy logs).
set -uo pipefail

url="" timeout="" interval=2 pid_file="" output=/dev/null
while [ $# -gt 0 ]; do
  case "$1" in
    --url) url="${2:-}"; shift 2 ;;
    --timeout) timeout="${2:-}"; shift 2 ;;
    --interval) interval="${2:-}"; shift 2 ;;
    --pid-file) pid_file="${2:-}"; shift 2 ;;
    --output) output="${2:-}"; shift 2 ;;
    *) echo "wait-for-ready: unknown option $1" >&2; exit 2 ;;
  esac
done
case "${timeout}${interval}" in
  '' | *[!0-9]*) echo "wait-for-ready: --timeout and --interval must be whole numbers" >&2; exit 2 ;;
esac
[ -n "$url" ] || { echo "wait-for-ready: --url is required" >&2; exit 2; }

deadline=$((SECONDS + timeout))
next_note=$((SECONDS + 10))
while [ "$SECONDS" -lt "$deadline" ]; do
  if [ -n "$pid_file" ] && [ -f "$pid_file" ] && ! kill -0 "$(tr -d '\n' < "$pid_file")" 2>/dev/null; then
    echo "wait-for-ready: the server exited before ${url} was ready." >&2
    exit 1
  fi
  if curl -sfS --max-time 10 "$url" -o "$output" 2>/dev/null; then
    echo "wait-for-ready: ${url} is ready (${SECONDS}s)."
    exit 0
  fi
  if [ "$SECONDS" -ge "$next_note" ]; then
    echo "wait-for-ready: waiting for ${url}…"
    next_note=$((SECONDS + 10))
  fi
  sleep "$interval"
done
echo "wait-for-ready: ${url} was not ready within ${timeout} seconds." >&2
exit 1
