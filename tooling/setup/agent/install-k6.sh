#!/usr/bin/env bash
# Install k6 for Claude Code on the web (cloud agent) sessions — and the scheduled CI load job.
#
# Why: the `pnpm load:*` scripts run `k6 run src/tests/load/k6/scenarios/*.js`, and the
# cloud image does not ship k6, so no load scenario can run in a session until it is
# installed. Paste into the environment's *Setup script* field (runs as root, cached),
# or let bootstrap.sh run it:
#
#     bash tooling/setup/agent/install-k6.sh
#
# Version: pinned in tool-versions.sh (K6_VERSION + K6_SHA256_LINUX_<ARCH>). Installs when
# missing, reinstalls when the installed version differs, and refuses a download whose
# SHA-256 does not match the pin. CI's scheduled load job runs this same script.
#
# Network: the github.com release download (in the default Trusted allowlist). The
# "latest release" lookups (github.com/.../releases/latest, api.github.com) are blocked
# there — one more reason the version is pinned.
#
# Idempotent and best-effort: never hard-fails the setup chain over an optional tool.
# Output goes to stderr (diagnostics).
set -uo pipefail

readonly DESTINATION="/usr/local/bin"

# shellcheck source=tool-install.lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tool-install.lib.sh"
k6_version="$(pinned_version K6_VERSION)"
current_version="$(installed_version k6 version)"

if [ "${current_version}" = "${k6_version}" ]; then
  echo "install-k6: k6 ${current_version} is at the pin — nothing to install." >&2
  exit 0
fi

require_linux k6 "${k6_version}" || exit 0
architecture="$(linux_architecture)"
expected_sha256="$(pinned_version "K6_SHA256_LINUX_$(printf '%s' "${architecture}" | tr '[:lower:]' '[:upper:]')")"
release="k6-v${k6_version}-linux-${architecture}"
url="https://github.com/grafana/k6/releases/download/v${k6_version}/${release}.tar.gz"
temporary_directory="$(mktemp -d)"
echo "install-k6: installing k6 ${k6_version} (found: ${current_version:-none})…" >&2
if download_verified "${url}" "${temporary_directory}/${release}.tar.gz" "${expected_sha256}" \
  && tar -xzf "${temporary_directory}/${release}.tar.gz" -C "${temporary_directory}" "${release}/k6" 2>/dev/null \
  && install -m 0755 "${temporary_directory}/${release}/k6" "${DESTINATION}/k6"; then
  echo "install-k6: installed $(k6 version 2>/dev/null | head -1) (SHA-256 verified)." >&2
else
  echo "install-k6: install failed — install k6 ${k6_version} manually (non-fatal)." >&2
fi
rm -rf "${temporary_directory}"
exit 0
