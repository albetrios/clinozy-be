#!/usr/bin/env bash
# Install the repo's pinned Node.js into /opt/node<major> for Claude Code on the
# web (cloud agent) sessions.
#
# Why this exists: the cloud image ships Node 20/21/22 (under /opt/nodeXX via
# nvm), but this project requires the version pinned in .nvmrc (>=24). This installs
# that version into /opt/node<major> — the same layout the image uses and exactly
# where agent-os/hooks/be-session-start.mjs looks — so the SessionStart hook switches
# PATH to it and runs `pnpm install` automatically. No repo changes required.
#
# Runs from three places: the environment's cached *Setup script* (via
# `bootstrap.sh --install-only`, as root), `bootstrap.sh` step 1, and the
# SessionStart hook, which installs it on a web session that has no new-enough Node
# on disk (a Setup script not configured, or a cache older than the pin). As a
# non-root user it re-runs itself through passwordless sudo.
#
# The hook's PATH switch reaches only the Bash tool, and only when the hook loads — a
# session that holds both repos loads none. So the pinned node, npm, npx, corepack and
# pnpm are also linked into ~/.local/bin, which the image puts ahead of its own
# /opt/node22/bin: every shell resolves the pinned Node, Claude Code's own process
# included. Only on the image layout — a Node from nvm or anywhere else is left alone.
#
#     bash tooling/setup/agent/install-node.sh
#
# Network: the Setup script needs egress to nodejs.org, which is NOT in the
# default "Trusted" allowlist. Set Network access to "Custom", add `nodejs.org`,
# and keep "Also include default list of common package managers" checked.
#
# Env:
#   NODE_INSTALL_PREFIX (default /opt) — parent dir for node<major>
#   NODE_LINK_USER_BIN  (default 1)    — 0 skips the ~/.local/bin links
#
# Fails FAST (set -euo pipefail): a setup-time install error should surface, not
# leave a half-broken toolchain. Idempotent: re-running is a no-op once the
# pinned version is present (Setup scripts re-run on cache rebuilds).
set -euo pipefail

readonly INSTALL_PREFIX="${NODE_INSTALL_PREFIX:-/opt}"

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

# The version is .nvmrc — the one Node pin — as a full x.y.z (the dist tarball URL needs it).
version="$(tr -dc '0-9.' < "${repository_root}/.nvmrc" 2>/dev/null || true)"
case "${version}" in
  *.*.*) ;;
  *)
    echo "install-node: .nvmrc must pin an exact Node x.y.z (found '${version}')." >&2
    exit 1
    ;;
esac
readonly version
major="${version%%.*}"
readonly target_dir="${INSTALL_PREFIX}/node${major}"

# Link the pinned toolchain into ~/.local/bin (see the header). Skipped unless the node on
# PATH is the image's (<prefix>/node<major>), missing, or an earlier link of this script.
link_pinned_toolchain() {
  [ "${NODE_LINK_USER_BIN:-1}" = 1 ] || return 0
  local user_bin="${HOME}/.local/bin" current tool linked=""
  current="$(command -v node 2>/dev/null || true)"
  case "${current}" in
    "" | "${INSTALL_PREFIX}"/node*/bin/node | "${user_bin}/node") ;;
    *)
      echo "install-node: node on PATH is ${current}, not the image layout — not linking."
      return 0
      ;;
  esac
  # pnpm comes from the pinned Node's corepack (package.json pins the version), not the image's.
  [ -x "${target_dir}/bin/pnpm" ] \
    || "${target_dir}/bin/corepack" enable --install-directory "${target_dir}/bin" pnpm \
    || echo "install-node: corepack enable pnpm failed (non-fatal)."
  mkdir -p "${user_bin}"
  for tool in node npm npx corepack pnpm pnpx; do
    [ -x "${target_dir}/bin/${tool}" ] || continue
    ln -sfn "${target_dir}/bin/${tool}" "${user_bin}/${tool}" && linked="${linked} ${tool}"
  done
  echo "install-node: linked${linked} from ${target_dir}/bin into ${user_bin}."
}

# Cloud images are Linux and this installs a linux tarball; on a developer machine (macOS) the
# Node comes from nvm, so there is nothing to install.
if [ "$(uname -s)" != "Linux" ]; then
  echo "install-node: $(uname -s) is not a cloud image — using the session Node (nvm)."
  exit 0
fi

# Idempotent: skip the download when the target already has this exact version.
if [ -x "${target_dir}/bin/node" ] && [ "$("${target_dir}/bin/node" -v 2>/dev/null)" = "v${version}" ]; then
  echo "install-node: Node v${version} already present at ${target_dir} — nothing to download."
  link_pinned_toolchain
  exit 0
fi

case "$(uname -m)" in
  x86_64) arch="x64" ;;
  aarch64 | arm64) arch="arm64" ;;
  *)
    echo "install-node: unsupported architecture '$(uname -m)'." >&2
    exit 1
    ;;
esac

# <prefix> (default /opt) needs root. As another user, re-run through passwordless sudo
# and hand the directory back, so corepack/pnpm can write their shims without sudo.
if ! { mkdir -p "${target_dir}" 2>/dev/null && [ -w "${target_dir}" ]; }; then
  if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    sudo -n env NODE_INSTALL_PREFIX="${INSTALL_PREFIX}" NODE_LINK_USER_BIN=0 bash "${BASH_SOURCE[0]}"
    sudo -n chown -R "$(id -u):$(id -g)" "${target_dir}"
    # Linked here, not by the sudo child, so the links land in this user's ~/.local/bin.
    link_pinned_toolchain
    exit 0
  fi
  echo "install-node: cannot write ${target_dir} — run as root or with passwordless sudo." >&2
  exit 1
fi

readonly tarball="node-v${version}-linux-${arch}.tar.xz"
readonly url="https://nodejs.org/dist/v${version}/${tarball}"

echo "install-node: downloading ${url}"
temporary_directory="$(mktemp -d)"
curl -fsSL "${url}" -o "${temporary_directory}/${tarball}"

tar -xJf "${temporary_directory}/${tarball}" -C "${target_dir}" --strip-components=1
rm -r "${temporary_directory}"

echo "install-node: installed Node $("${target_dir}/bin/node" -v) at ${target_dir}"
link_pinned_toolchain
