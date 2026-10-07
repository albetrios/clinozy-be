#!/usr/bin/env bash
# Install k6 for Claude Code on the web (cloud agent) sessions.
#
# Why: the `pnpm load:*` scripts run `k6 run src/tests/load/k6/scenarios/*.js`, and the
# cloud image does not ship k6, so no load scenario can run in a session until it is
# installed. Paste into the environment's *Setup script* field (runs as root, cached),
# or let bootstrap.sh run it:
#
#     bash tooling/setup/agent/install-k6.sh
#
# Network: the github.com release download (in the default Trusted allowlist). The
# "latest release" lookups (github.com/.../releases/latest, api.github.com) are blocked
# there, hence the pinned version. The scheduled CI load job installs the latest k6
# (grafana/setup-k6-action) — bump K6_VERSION when a new major lands.
#
# Idempotent and best-effort: never hard-fails the setup chain over an optional tool.
# Output goes to stderr (diagnostics).
set -uo pipefail

readonly K6_VERSION="2.3.0"
readonly DESTINATION="/usr/local/bin"

if command -v k6 >/dev/null 2>&1; then
  echo "install-k6: $(k6 version 2>/dev/null | head -1) already present — nothing to do." >&2
  exit 0
fi

case "$(dpkg --print-architecture 2>/dev/null || uname -m)" in
  arm64 | aarch64) asset_arch="arm64" ;;
  *) asset_arch="amd64" ;;
esac

release="k6-v${K6_VERSION}-linux-${asset_arch}"
url="https://github.com/grafana/k6/releases/download/v${K6_VERSION}/${release}.tar.gz"
tmpdir="$(mktemp -d)"
if curl -fsSL "${url}" -o "${tmpdir}/${release}.tar.gz" 2>/dev/null \
  && tar -xzf "${tmpdir}/${release}.tar.gz" -C "${tmpdir}" "${release}/k6" 2>/dev/null \
  && install -m 0755 "${tmpdir}/${release}/k6" "${DESTINATION}/k6"; then
  echo "install-k6: installed $(k6 version 2>/dev/null | head -1) from github.com release binary." >&2
else
  echo "install-k6: release download failed — install k6 manually (non-fatal)." >&2
fi
rm -rf "${tmpdir}"
exit 0
