#!/usr/bin/env bash
# Install gitleaks for Claude Code on the web (cloud agent) sessions.
#
# Why: the pre-commit guard's "Staged secrets scan" step
# ([`src/scripts/tooling/run-pre-commit-guard.ts`](../../../src/scripts/tooling/run-pre-commit-guard.ts))
# shells out to `gitleaks protect --staged …` and hard-errors when the binary is
# missing; the CI `security-secrets` job runs `gitleaks detect` too. The cloud
# image does not ship gitleaks, so a cloud session cannot commit (the guard fails)
# until it is installed. Adding it here makes the in-session secret scan work the
# same as local. Paste into the environment's *Setup script* field (runs as root,
# cached), AFTER install-node.sh:
#
#     bash tooling/setup/agent/install-node.sh
#     bash tooling/setup/agent/install-gitleaks.sh
#
# Network: the github.com release binary (primary path) is reachable on the
# default Trusted allowlist — no extra allowlist entry required. The `go install`
# fallback needs Go on PATH plus the Go module proxy (proxy.golang.org); it only
# runs when the release download fails.
#
# Version: pinned in tool-versions.sh (GITLEAKS_VERSION + GITLEAKS_SHA256_LINUX_<ARCH>),
# which the CI `security-secrets` job reads too — one pin, no drift. Installs when missing,
# reinstalls when the installed version differs, and refuses a release download whose
# SHA-256 does not match the pin.
#
# Idempotent and best-effort: never hard-fails the setup chain over an optional
# tool. Output goes to stderr (diagnostics).
set -uo pipefail

readonly DESTINATION="/usr/local/bin"

# shellcheck source=tool-install.lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tool-install.lib.sh"
gitleaks_version="$(pinned_version GITLEAKS_VERSION)"
current_version="$(installed_version gitleaks version)"

if [ "${current_version}" = "${gitleaks_version}" ]; then
  echo "install-gitleaks: gitleaks ${current_version} is at the pin — nothing to install." >&2
  exit 0
fi
require_linux gitleaks "${gitleaks_version}" || exit 0
echo "install-gitleaks: installing gitleaks ${gitleaks_version} (found: ${current_version:-none})…" >&2

# gitleaks release assets name amd64 "x64" and arm64 "arm64".
case "$(linux_architecture)" in
  arm64) asset_architecture="arm64" ;;
  *) asset_architecture="x64" ;;
esac
expected_sha256="$(pinned_version "GITLEAKS_SHA256_LINUX_$(printf '%s' "${asset_architecture}" | tr '[:lower:]' '[:upper:]')")"

# 1) Official release binary from github.com (in the default Trusted allowlist),
#    SHA-256-verified against the pin. No compile.
tarball="gitleaks_${gitleaks_version}_linux_${asset_architecture}.tar.gz"
url="https://github.com/gitleaks/gitleaks/releases/download/v${gitleaks_version}/${tarball}"
temporary_directory="$(mktemp -d)"
if download_verified "${url}" "${temporary_directory}/${tarball}" "${expected_sha256}" \
  && tar -xzf "${temporary_directory}/${tarball}" -C "${temporary_directory}" gitleaks 2>/dev/null; then
  install -m 0755 "${temporary_directory}/gitleaks" "${DESTINATION}/gitleaks"
  rm -rf "${temporary_directory}"
  echo "install-gitleaks: installed gitleaks $(gitleaks version 2>/dev/null) (SHA-256 verified)." >&2
  exit 0
fi
rm -rf "${temporary_directory}"
echo "install-gitleaks: github.com release binary unavailable or unverified — trying \`go install\`." >&2

# 2) Fallback — build from source with Go (present on the cloud image). gitleaks
#    still declares its legacy module path in go.mod, so `go install` MUST use
#    github.com/zricethezav/gitleaks (NOT the current github.com/gitleaks repo
#    path, which fails the module-path check). GOBIN drops it straight on PATH.
#    The Go checksum database (sum.golang.org) verifies the module source.
if command -v go >/dev/null 2>&1; then
  if GOBIN="${DESTINATION}" go install \
       "github.com/zricethezav/gitleaks/v8@v${gitleaks_version}" >&2 2>&1; then
    echo "install-gitleaks: installed gitleaks via \`go install\` (v${gitleaks_version}; Go checksum database verified)." >&2
    exit 0
  fi
  echo "install-gitleaks: \`go install\` failed — install gitleaks manually (non-fatal)." >&2
else
  echo "install-gitleaks: Go not on PATH for the fallback — install gitleaks manually (non-fatal)." >&2
fi

exit 0
