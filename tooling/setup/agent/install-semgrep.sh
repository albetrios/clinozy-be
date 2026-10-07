#!/usr/bin/env bash
# Install semgrep for Claude Code on the web (cloud agent) sessions.
#
# Why: `pnpm security:sast` runs `semgrep --config auto src/`, and the cloud image does not
# ship semgrep, so the SAST scan fails in a session until it is installed. Paste into the
# environment's *Setup script* field (runs as root, cached), or let bootstrap.sh run it:
#
#     bash tooling/setup/agent/install-semgrep.sh
#
# Unpinned, like the CI SAST job in `.github/workflows/pr-ci.yml` (`pip install semgrep`).
#
# Network: the install needs PyPI only (in the default Trusted allowlist). Running
# `--config auto` downloads its rules from `semgrep.dev` — add that host under Custom
# network access or the scan fails.
#
# Idempotent and best-effort: never hard-fails the setup chain over an optional tool.
# Output goes to stderr (diagnostics).
set -uo pipefail

if command -v semgrep >/dev/null 2>&1; then
  echo "install-semgrep: semgrep $(semgrep --version 2>/dev/null) already present — nothing to do." >&2
  exit 0
fi

# uv (on the cloud image; install-headroom.sh uses it too) → pipx → pip --user. Each puts
# the CLI in ~/.local/bin, which is on PATH in the session.
if command -v uv >/dev/null 2>&1 && uv tool install semgrep >&2 2>&1; then
  echo "install-semgrep: installed semgrep via uv." >&2
elif command -v pipx >/dev/null 2>&1 && pipx install semgrep >&2 2>&1; then
  echo "install-semgrep: installed semgrep via pipx." >&2
elif python3 -m pip install --user semgrep >&2 2>&1; then
  echo "install-semgrep: installed semgrep via pip --user." >&2
else
  echo "install-semgrep: install failed — run \`uv tool install semgrep\` manually (non-fatal)." >&2
fi
exit 0
