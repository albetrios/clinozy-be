#!/usr/bin/env bash
# Install semgrep for Claude Code on the web (cloud agent) sessions.
#
# Why: `pnpm security:sast` runs `semgrep --config auto src/`, and the cloud image does not
# ship semgrep, so the SAST scan fails in a session until it is installed. Paste into the
# environment's *Setup script* field (runs as root, cached), or let bootstrap.sh run it:
#
#     bash tooling/setup/agent/install-semgrep.sh
#
# Version: pinned in tool-versions.sh (SEMGREP_VERSION) — the CI SAST job installs the same
# pin. Installs when missing, reinstalls when the installed version differs.
#
# Network: the install needs PyPI only (in the default Trusted allowlist). Running
# `--config auto` downloads its rules from `semgrep.dev` — add that host under Custom
# network access or the scan fails. The rules are not pinned: they come from the registry
# at scan time, so results can change even on the pinned semgrep.
#
# Idempotent and best-effort: never hard-fails the setup chain over an optional tool.
# Output goes to stderr (diagnostics).
set -uo pipefail

# shellcheck source=tool-install.lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tool-install.lib.sh"
semgrep_version="$(pinned_version SEMGREP_VERSION)"
current_version="$(installed_version semgrep --version)"
package="semgrep==${semgrep_version}"

if [ "${current_version}" = "${semgrep_version}" ]; then
  echo "install-semgrep: semgrep ${current_version} is at the pin — nothing to install." >&2
  exit 0
fi

# uv (on the cloud image; install-headroom.sh uses it too) → pipx → pip --user. Each puts
# the CLI in ~/.local/bin, which is on PATH in the session. `--force` replaces a different
# installed version with the pin.
echo "install-semgrep: installing ${package} (found: ${current_version:-none})…" >&2
if command -v uv >/dev/null 2>&1 && uv tool install --force "${package}" >&2 2>&1; then
  echo "install-semgrep: installed ${package} via uv." >&2
elif command -v pipx >/dev/null 2>&1 && pipx install --force "${package}" >&2 2>&1; then
  echo "install-semgrep: installed ${package} via pipx." >&2
elif python3 -m pip install --user "${package}" >&2 2>&1; then
  echo "install-semgrep: installed ${package} via pip --user." >&2
else
  echo "install-semgrep: install failed — run \`uv tool install '${package}'\` manually (non-fatal)." >&2
fi
exit 0
