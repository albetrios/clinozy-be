#!/usr/bin/env bash
# The agent's own tools, apart from the app stack: gh, CodeGraph and its index, Headroom + the
# default MCP pair + the session hooks, gitleaks, semgrep and k6 — each at its pin in
# tool-versions.sh — then every pin and the MCP servers checked (pnpm tool:agent-tools).
#
#   bash tooling/setup/agent/install-agent-tools.sh
#
# bootstrap.sh runs it inline in the Setup script (--install-only) and, in a session, detached once
# the stack is live ($AGENT_STACK_DIR/agent-tools.log): the app needs none of these, so they never
# hold "live" up. The installs run only when the pins or the installers changed since they last
# passed the check here (a stamp, the hash of those files); a failed check leaves the stamp alone,
# so the next run tries again. The CodeGraph index sync and the session hooks run every time,
# since they follow the code, not the pins. Best-effort: exit 1 when a tool is off its pin or an
# MCP server does not answer, which bootstrap.sh logs and carries on from.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../../.." || exit 1
readonly AGENT_DIR="tooling/setup/agent"
readonly STAMP_DIR="node_modules/.agent-stamps"
readonly STAMP_FILE="${STAMP_DIR}/agent-tools"

# Tools installed per-user (headroom via pip, codegraph via npm) land here. Appended, not
# prepended: other tools drop their own `node` into ~/.local/bin, which must not shadow the
# pinned or nvm Node.
export PATH="${PATH}:${HOME}/.local/bin"

ok()   { echo "✓ $*"; }
skip() { echo "• $*"; }

tool_inputs() {
  cat "${AGENT_DIR}/tool-versions.sh" "${AGENT_DIR}/tool-install.lib.sh" \
    "${AGENT_DIR}/install-gh.sh" "${AGENT_DIR}/install-codegraph.sh" \
    "${AGENT_DIR}/install-headroom.sh" "${AGENT_DIR}/install-gitleaks.sh" \
    "${AGENT_DIR}/install-semgrep.sh" "${AGENT_DIR}/install-k6.sh" \
    "${AGENT_DIR}/install-agent-tools.sh" .mcp.default.json 2>/dev/null
}
stamp="$(tool_inputs | { sha256sum 2>/dev/null || shasum -a 256; } | cut -d' ' -f1)"

# A session that holds several repositories reads hooks only from the parent directory's
# .claude/settings.json and .mcp.json; agent-os:session-hooks writes every repository's hooks and
# codegraph server there (a no-op in a single-repository checkout). Cheap, and it follows each repository's hooks.json, so every run.
write_session_hooks() {
  pnpm agent-os:session-hooks || skip "agent-os:session-hooks failed (non-fatal)"
}

if [ -f "${STAMP_FILE}" ] && [ "$(cat "${STAMP_FILE}")" = "${stamp}" ]; then
  skip "agent tool installs skipped — the same pins and installers passed here before (${STAMP_FILE})"
  if command -v codegraph >/dev/null 2>&1 && [ -d .codegraph ]; then
    codegraph sync 2>&1 || skip "codegraph sync failed (non-fatal)"
  fi
  write_session_hooks
  ok "agent tools ready"
  exit 0
fi

# GitHub CLI ------------------------------------------------------------------
bash "${AGENT_DIR}/install-gh.sh" || true
if command -v gh >/dev/null 2>&1; then ok "$(gh --version | head -1)"; else skip "gh unavailable (non-fatal)"; fi

# CodeGraph CLI + index -------------------------------------------------------
bash "${AGENT_DIR}/install-codegraph.sh" || true
if command -v codegraph >/dev/null 2>&1; then ok "codegraph $(codegraph --version 2>/dev/null)"; else skip "codegraph unavailable (non-fatal)"; fi

# Headroom CLI + the default MCP pair (context compression) + session hooks -----
bash "${AGENT_DIR}/install-headroom.sh" || true
pnpm mcp:setup:default || skip "mcp:setup:default failed (non-fatal)"
write_session_hooks
if command -v headroom >/dev/null 2>&1; then ok "headroom $(headroom --version 2>/dev/null)"; else skip "headroom unavailable (non-fatal)"; fi

# gitleaks (pre-commit secret scan) + semgrep (security:sast) + k6 (load:*) ------
bash "${AGENT_DIR}/install-gitleaks.sh" || true
bash "${AGENT_DIR}/install-semgrep.sh" || true
bash "${AGENT_DIR}/install-k6.sh" || true
if command -v gitleaks >/dev/null 2>&1; then ok "gitleaks $(gitleaks version 2>/dev/null)"; else skip "gitleaks unavailable — pre-commit secret scan will fail (non-fatal)"; fi
if command -v semgrep >/dev/null 2>&1; then ok "semgrep $(semgrep --version 2>/dev/null)"; else skip "semgrep unavailable — pnpm security:sast will fail (non-fatal)"; fi
if command -v k6 >/dev/null 2>&1; then ok "$(k6 version 2>/dev/null | head -1)"; else skip "k6 unavailable — pnpm load:* will fail (non-fatal)"; fi

# Every tool against its pin in tool-versions.sh, the default MCP servers started for real
# (initialize + tools/list), and the newer releases waiting — report only: a bump is a PR.
if pnpm tool:agent-tools --smoke --outdated; then
  mkdir -p "${STAMP_DIR}" && printf '%s\n' "${stamp}" > "${STAMP_FILE}"
  ok "agent tools at their pins; MCP servers answer"
  exit 0
fi
skip "agent tools: one is off its pin or failed its MCP smoke test — see the report above (non-fatal; the next run tries again)"
exit 1
