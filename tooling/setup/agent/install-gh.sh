#!/usr/bin/env bash
# Install the GitHub CLI (gh) for Claude Code on the web (cloud agent) sessions.
#
# Why: gives an in-session GitHub fallback — read Actions logs, check CI, merge —
# alongside the GitHub MCP tools (which already cover this). Paste into the
# environment's *Setup script* field (runs as root, cached), AFTER install-node.sh:
#
#     bash tooling/setup/agent/install-node.sh
#     bash tooling/setup/agent/install-gh.sh
#
# Auth: set GH_TOKEN in the environment's *Variables* — gh reads it automatically,
# no `gh auth login` needed. Use a least-privilege token (repo: contents +
# pull_requests + actions:read is enough to read logs and merge). Environment
# variables are visible to anyone who can edit the environment — there is no
# secrets store.
#
# Version: GH_VERSION in tool-versions.sh (an environment variable of that name wins, a trial),
# never the latest release, and the release tarball must match its pinned SHA-256 (H-12). The
# apt fallbacks below install a package apt has verified against its repository's signing key.
#
# Idempotent and best-effort: never hard-fails the setup chain over an optional
# tool. Output goes to stderr (diagnostics).
set -uo pipefail

if command -v gh >/dev/null 2>&1; then
  echo "install-gh: $(gh --version | head -1) already present — nothing to do." >&2
  exit 0
fi

# shellcheck source=tool-install.lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tool-install.lib.sh"

# 1) The pinned release binary from github.com (in the default Trusted allowlist), SHA-256-verified
#    against the pin. No apt repo or extra allowlist entry needed.
if [ "$(uname -s)" = "Linux" ]; then
  gh_version="$(pinned_version GH_VERSION)"
  gh_architecture="$(linux_architecture)"
  gh_tarball="gh_${gh_version}_linux_${gh_architecture}.tar.gz"
  gh_url="https://github.com/cli/cli/releases/download/v${gh_version}/${gh_tarball}"
  expected_sha256="$(pinned_version "GH_SHA256_LINUX_$(printf '%s' "${gh_architecture}" | tr '[:lower:]' '[:upper:]')")"
  temporary_directory="$(mktemp -d)"
  if [ -n "${gh_version}" ] \
    && download_verified "${gh_url}" "${temporary_directory}/${gh_tarball}" "${expected_sha256}" \
    && tar -xzf "${temporary_directory}/${gh_tarball}" -C "${temporary_directory}" 2>/dev/null \
    && install -m 0755 "${temporary_directory}/gh_${gh_version}_linux_${gh_architecture}/bin/gh" /usr/local/bin/gh; then
    rm -rf "${temporary_directory}"
    echo "install-gh: installed $(gh --version | head -1) from the github.com release (SHA-256 verified)." >&2
    exit 0
  fi
  rm -rf "${temporary_directory}"
  echo "install-gh: the pinned github.com release is unavailable or unverified — trying apt." >&2
fi

# 2) Distro package — needs only the Ubuntu mirrors (in the default Trusted allowlist).
if apt-get update >/dev/null 2>&1 && apt-get install -y gh >/dev/null 2>&1; then
  echo "install-gh: installed $(gh --version | head -1) via apt." >&2
  exit 0
fi

# 3) Fallback — official GitHub CLI apt repo (needs cli.github.com on the
#    network allowlist; add it under Custom access if Trusted blocks it).
echo "install-gh: adding the official GitHub CLI apt repo." >&2
keyring=/etc/apt/keyrings/githubcli-archive-keyring.gpg
install -m 0755 -d /etc/apt/keyrings
if curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o "$keyring"; then
  chmod go+r "$keyring"
  printf 'deb [arch=%s signed-by=%s] https://cli.github.com/packages stable main\n' \
    "$(dpkg --print-architecture)" "$keyring" > /etc/apt/sources.list.d/github-cli.list
  if apt-get update >/dev/null 2>&1 && apt-get install -y gh >/dev/null 2>&1; then
    echo "install-gh: installed $(gh --version | head -1) via cli.github.com." >&2
    exit 0
  fi
fi

echo "install-gh: could not install gh — check that cli.github.com is on the network allowlist." >&2
exit 0
