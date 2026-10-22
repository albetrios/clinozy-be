#!/usr/bin/env bash
# Install the Headroom CLI + register its MCP server for Claude Code on the web
# (cloud agent) sessions. Headroom (headroom-ai) is a local context-compression
# layer: its MCP server exposes headroom_compress / headroom_retrieve /
# headroom_stats so agents shrink large tool output, logs, files, and RAG chunks
# before they reach the model. See agent-os/rules/be-headroom-context-compression.mdc
# and docs/integrations/agentic-third-party-tooling.md.
#
# Usage: paste into the environment's *Setup script* field (runs as root, cached),
# or run standalone:
#
#     bash tooling/setup/agent/install-headroom.sh
#
# Network: needs pypi.org + files.pythonhosted.org (PyPI) for the install.
#
# MCP: Claude Code connects MCP servers when it starts, so a server installed mid-session
# loads at the next start. `headroom mcp install` (run below, best-effort) registers headroom
# at user level: the one server a session holding both repositories uses (it runs from their
# parent, where no repository's .mcp.json is read). A single-repository session reads the
# repository's .mcp.json, which ensure_default_mcp_servers declares below.
#
# Idempotent and best-effort: never hard-fails the setup chain. Diagnostics → stderr.
set -uo pipefail

# Lightweight MCP-only extra; use headroom-ai[all] for the full embedder runtime (the `code`
# extra adds nothing to the MCP compress path — measured 0% either way on code, logs, JSON).
# The version is pinned in tool-versions.sh (HEADROOM_VERSION).
readonly HEADROOM_PACKAGE="headroom-ai[mcp]"

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "${repository_root}" || exit 0

# Put the user-local bin (where uv / pipx / pip --user drop console scripts) on
# PATH, both for this process and — when running as the cached Setup script — for
# every later session via CLAUDE_ENV_FILE. Mirrors the PATH handling in
# install-node.sh / install-codegraph.sh.
user_bin="${HOME}/.local/bin"
case ":${PATH}:" in
  *":${user_bin}:"*) : ;;
  *)
    export PATH="${user_bin}:${PATH}"
    [ -n "${CLAUDE_ENV_FILE:-}" ] && printf 'export PATH=%s:$PATH\n' "${user_bin}" >> "${CLAUDE_ENV_FILE}"
    ;;
esac

# shellcheck source=tool-install.lib.sh
source "${repository_root}/tooling/setup/agent/tool-install.lib.sh"
headroom_version="$(pinned_version HEADROOM_VERSION)"
current_version="$(installed_version headroom --version)"
package="${HEADROOM_PACKAGE}==${headroom_version}"

if [ "${current_version}" = "${headroom_version}" ]; then
  echo "install-headroom: headroom ${current_version} is at the pin — nothing to install." >&2
else
  # Prefer uv (already the repo's Python tool runner for MCP servers); fall back to
  # pipx, then pip --user. The PEP 668 "externally-managed" marker on system Python
  # blocks a bare system pip install, so isolated installers (uv / pipx) come first.
  # `--force` replaces a different installed version with the pin.
  echo "install-headroom: installing '${package}' (found: ${current_version:-none})…" >&2
  installed=0
  if command -v uv >/dev/null 2>&1; then
    uv tool install --force "${package}" >&2 2>&1 && installed=1
  fi
  if [ "${installed}" -eq 0 ] && command -v pipx >/dev/null 2>&1; then
    pipx install --force "${package}" >&2 2>&1 && installed=1
  fi
  if [ "${installed}" -eq 0 ] && command -v python3 >/dev/null 2>&1; then
    if python3 -m pip install --user "${package}" >&2 2>&1 \
      || python3 -m pip install --user --break-system-packages "${package}" >&2 2>&1; then
      installed=1
    fi
  fi
  if [ "${installed}" -eq 0 ]; then
    echo "install-headroom: install failed — install \`uv\` (or pipx) and run \`uv tool install '${package}'\` manually (non-fatal)." >&2
    exit 0
  fi
fi

# uv may have just created ${user_bin}; refresh the command hash table so the new
# `headroom` console script resolves in this shell.
hash -r 2>/dev/null || true

if command -v headroom >/dev/null 2>&1; then
  # Best-effort, non-interactive (stdin closed so any prompt gets EOF instead of
  # blocking the cached Setup script).
  echo "install-headroom: registering MCP server (headroom mcp install)…" >&2
  headroom mcp install </dev/null >&2 2>&1 \
    || echo "install-headroom: \`headroom mcp install\` failed — configure the MCP \`headroom\` server manually (non-fatal)." >&2
  echo "install-headroom: done ($(headroom --version 2>/dev/null || echo 'cli unavailable'))." >&2
else
  echo "install-headroom: headroom CLI not on PATH after install (check ${user_bin}) — non-fatal." >&2
fi

# Ensure the default MCP pair (codegraph + headroom) is declared in .mcp.json so the
# session matches `pnpm setup:local`. install-codegraph.sh only builds the index; this merges
# in the committed `.mcp.default.json` (codegraph + headroom), preserving any other
# entries — never clobbering real keys. Best-effort: needs jq + the template.
ensure_default_mcp_servers() {
  command -v jq >/dev/null 2>&1 || {
    echo "install-headroom: jq not found — skipping .mcp.json default-pair merge (non-fatal)." >&2
    return 0
  }
  [ -f .mcp.default.json ] || {
    echo "install-headroom: .mcp.default.json missing — skipping .mcp.json merge (non-fatal)." >&2
    return 0
  }
  local current='{"mcpServers":{}}'
  [ -f .mcp.json ] && current="$(cat .mcp.json 2>/dev/null || echo '{"mcpServers":{}}')"
  if printf '%s' "${current}" | jq \
      --slurpfile defaults .mcp.default.json \
      '.mcpServers = (($defaults[0].mcpServers // {}) + (.mcpServers // {}))' \
      > .mcp.json.tmp 2>/dev/null; then
    # Write only when the servers change, and through any symlink (`cat >`, not `mv`):
    # the committed .mcp.json is a symlink to agent-os/mcp/mcp.json, and replacing it with
    # a reformatted copy left every bootstrap with a dirty tree.
    if [ "$(jq -S . .mcp.json.tmp)" = "$(printf '%s' "${current}" | jq -S . 2>/dev/null)" ]; then
      echo "install-headroom: codegraph + headroom already in .mcp.json." >&2
    else
      cat .mcp.json.tmp > .mcp.json
      echo "install-headroom: ensured codegraph + headroom in .mcp.json." >&2
    fi
    rm -f .mcp.json.tmp
  else
    rm -f .mcp.json.tmp
    echo "install-headroom: .mcp.json default-pair merge failed (non-fatal)." >&2
  fi
}

ensure_default_mcp_servers
exit 0
