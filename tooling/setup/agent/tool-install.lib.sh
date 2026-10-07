# Shared helpers for the install-*.sh scripts: read a pin from tool-versions.sh, read the
# installed version, and download a release binary only when its checksum matches.
# Sourced, never executed:  source "<repo>/tooling/setup/agent/tool-install.lib.sh"

TOOL_VERSIONS_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tool-versions.sh"

# pinned_version KEY — the KEY's value: an environment variable of that name wins (a trial
# on a separate cloud environment), else the line in tool-versions.sh. Empty when neither.
pinned_version() {
  local key=$1
  if [ -n "${!key:-}" ]; then
    printf '%s' "${!key}"
    return
  fi
  sed -n "s/^${key}=//p" "${TOOL_VERSIONS_FILE}" | head -1
}

# installed_version COMMAND [ARGUMENTS…] — the first x.y.z the command prints (its version
# output), empty when the command is missing or prints none.
installed_version() {
  command -v "$1" >/dev/null 2>&1 || return 0
  "$@" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1
}

# require_linux TOOL VERSION — succeeds on Linux. Elsewhere (a macOS bootstrap) it says how
# to get the pinned version and fails, so an installer never drops a Linux release binary
# over a package-manager install.
require_linux() {
  [ "$(uname -s)" = "Linux" ] && return 0
  echo "install-$1: not Linux — the pinned release binary is Linux-only; install $1 $2 with your package manager (e.g. brew install $1) (non-fatal)." >&2
  return 1
}

# linux_architecture — amd64 or arm64, the two architectures the pinned binaries cover.
linux_architecture() {
  case "$(dpkg --print-architecture 2>/dev/null || uname -m)" in
    arm64 | aarch64) echo "arm64" ;;
    *) echo "amd64" ;;
  esac
}

# file_sha256 FILE — the file's SHA-256 (GNU sha256sum, or shasum on macOS).
file_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# download_verified URL DESTINATION EXPECTED_SHA256 — downloads URL to DESTINATION and
# succeeds only when its SHA-256 equals EXPECTED_SHA256; a mismatch deletes the file.
download_verified() {
  local url=$1 destination=$2 expected=$3 actual
  if [ -z "${expected}" ]; then
    echo "tool-install: no pinned SHA-256 for ${url} — refusing to install an unverified binary." >&2
    return 1
  fi
  curl -fsSL "${url}" -o "${destination}" 2>/dev/null || return 1
  actual="$(file_sha256 "${destination}")"
  if [ "${actual}" != "${expected}" ]; then
    rm -f "${destination}"
    echo "tool-install: SHA-256 mismatch for ${url} (pinned ${expected}, got ${actual}) — refusing to install." >&2
    echo "tool-install: trialling another version? Set its *_SHA256_* keys too (pnpm tool:agent-tools --outdated prints them)." >&2
    return 1
  fi
}
