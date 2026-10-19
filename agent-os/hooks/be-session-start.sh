#!/usr/bin/env bash
# Claude Code SessionStart hook for clinozy-be.
#
# Two jobs:
#   1. (web) Make the env usable: verify Node, switch to a new-enough Node when
#      needed (pinned for the session via $CLAUDE_ENV_FILE) — installing the .nvmrc
#      version first when none is on disk — and install deps so `pnpm validate` /
#      tests / linters work.
#   2. Inject session context: the agent-os skill-trigger routing map plus a
#      short env/commands summary, as SessionStart additionalContext.
#
#   stderr -> install logs / diagnostics (NOT added to context)
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_be-telemetry.sh"
telemetry_init "be-session-start" "SessionStart"
telemetry_fired  # SessionStart always emits the session briefing

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT" || exit 0

# --- Required Node major (from .nvmrc, fallback 24) --------------------------
required_major="24"
if [ -f .nvmrc ]; then
  parsed="$(tr -dc '0-9.' < .nvmrc | cut -d. -f1)"
  [ -n "$parsed" ] && required_major="$parsed"
fi
current_major="$(node -v 2>/dev/null | tr -dc '0-9.' | cut -d. -f1)"
[ -z "$current_major" ] && current_major="0"
node_ok="yes"; [ "$current_major" -lt "$required_major" ] 2>/dev/null && node_ok="no"

# --- If Node is too old, find a new-enough one and pin it for the session ----
activate_required_node() {
  for candidate in \
    "/opt/node${required_major}/bin" \
    /opt/node"${required_major}"*/bin \
    "${HOME}/.nvm/versions/node/v${required_major}"*/bin \
    /usr/local/node"${required_major}"*/bin; do
    [ -x "${candidate}/node" ] || continue
    cand_major="$("${candidate}/node" -v 2>/dev/null | tr -dc '0-9.' | cut -d. -f1)"
    if [ -n "$cand_major" ] && [ "$cand_major" -ge "$required_major" ] 2>/dev/null; then
      export PATH="${candidate}:${PATH}"
      [ -n "${CLAUDE_ENV_FILE:-}" ] && printf 'export PATH=%s:$PATH\n' "$candidate" >> "$CLAUDE_ENV_FILE"
      current_major="$cand_major"; node_ok="yes"
      echo "session-start: switched to $(node -v) at ${candidate} (persisted for the session)." >&2
      return 0
    fi
  done
  return 1
}
[ "$node_ok" = "no" ] && activate_required_node

# --- Self-heal (web): install the .nvmrc Node when none is on disk -----------
# The image ships Node 20-22 only; the pinned Node comes from the environment's cached
# Setup script. When that did not run (not configured, or a cache older than the pin),
# install it here — one nodejs.org download — so the dependency install, the gates and
# the live stack below all work in this session. Best-effort and fail-open.
if [ "$node_ok" = "no" ] && [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && [ -f tooling/setup/agent/install-node.sh ]; then
  echo "session-start: no Node >=${required_major} on disk — installing the .nvmrc version (best-effort)…" >&2
  bash tooling/setup/agent/install-node.sh >&2 && activate_required_node \
    || echo "session-start: Node install failed — run: bash tooling/setup/agent/install-node.sh" >&2
fi

# --- Install deps on remote (web) sessions when Node is adequate -------------
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  if [ "$node_ok" = "no" ]; then
    echo "session-start: Node $(node -v 2>/dev/null) is below required v${required_major} (.nvmrc) — skipping pnpm install." >&2
  elif [ ! -x node_modules/.bin/biome ]; then
    echo "session-start: installing dependencies (pnpm install)…" >&2
    corepack enable >/dev/null 2>&1 || true
    pnpm install --prefer-offline >&2 || pnpm install >&2 || echo "session-start: pnpm install failed (see log above)." >&2
  else
    echo "session-start: dependencies already present — skipping install." >&2
  fi
fi

# --- Slow probes run in the background ---------------------------------------
# agent-os:check and the five tool `--version` probes cost seconds (tens on a cold
# container), so they run detached: the banner shows the last finished result, and this
# run's result is there for the next session start. Their output never reaches this
# hook's stdout, so the session does not wait for them. CI still runs agent-os:check.
probe_directory="${TMPDIR:-/tmp}/clinozy-be-hooks/probes"
mkdir -p "${probe_directory}" 2>/dev/null || true
last_probe() { cat "${probe_directory}/$1" 2>/dev/null || echo "$2"; }

# --- Readiness check: agent-os integrity only (no DB) ------------------------
# The ONLY gate at startup. Heavy work (compose:up, db:migrate, db:seed, tests,
# pnpm dev) is intentionally left to run on demand per prompt — not bootstrapped
# here. Fail-open: never blocks the session.
agent_os_status="skipped"
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && [ -x node_modules/.bin/biome ]; then
  agent_os_status="$(last_probe agent-os-check 'first check running') — re-checking in the background (${probe_directory}/agent-os-check.log)"
  (
    if pnpm agent-os:check >"${probe_directory}/agent-os-check.log" 2>&1; then result="passed"; else result="failed — see ${probe_directory}/agent-os-check.log"; fi
    printf '%s at %s\n' "${result}" "$(date -u +%H:%M:%SZ)" >"${probe_directory}/agent-os-check"
  ) </dev/null >/dev/null 2>&1 &
fi

# --- Best-effort: ensure the Docker daemon is up on remote (web) sessions ----
# DB / Redis / chaos work needs `docker compose`, but the cloud image ships
# dockerd without starting it. Start it best-effort so `compose:up` works when
# invoked on demand; never block or fail the session. No-op locally (Docker
# Desktop owns the daemon), when the daemon is already reachable, when dockerd is
# absent, or when passwordless sudo is unavailable. compose:up / migrations /
# seeds remain on-demand per prompt — only the daemon is started here.
docker_status="n/a"
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    docker_status="up"
  elif command -v dockerd >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    echo "session-start: Docker daemon down — starting dockerd (best-effort)…" >&2
    setsid sudo -n dockerd >/tmp/dockerd-session-start.log 2>&1 </dev/null & disown 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do docker info >/dev/null 2>&1 && break; sleep 1; done
    if docker info >/dev/null 2>&1; then docker_status="started"; else docker_status="start-failed (run: sudo dockerd)"; fi
  else
    docker_status="down (start manually: sudo dockerd)"
  fi
fi

# --- Self-heal: ensure gitleaks is present for the pre-commit secret scan ----
# The pre-commit guard's "Staged secrets scan" shells out to `gitleaks` and
# hard-errors when it is missing, so a web session cannot commit without it. The
# cached Setup script installs it (tooling/setup/agent/install-gitleaks.sh), but
# an older cached image can predate that wiring — install on demand when absent
# so commits never block. No-op when already present (the common case): just a
# `command -v`, so startup stays light. Best-effort and fail-open, like above.
gitleaks_status="absent"
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks_status="present"
elif [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && [ -f tooling/setup/agent/install-gitleaks.sh ]; then
  echo "session-start: gitleaks missing — installing for the pre-commit secret scan (best-effort)…" >&2
  bash tooling/setup/agent/install-gitleaks.sh >&2 || true
  if command -v gitleaks >/dev/null 2>&1; then
    gitleaks_status="installed"
  else
    gitleaks_status="install-failed (run: bash tooling/setup/agent/install-gitleaks.sh)"
  fi
fi

# --- MCP config: declare the default server pair before the first prompt ------
# Claude Code reads `.mcp.json` at startup (a tracked symlink → the gitignored
# agent-os/mcp/mcp.json, shared with .cursor/mcp.json). On local sessions, scaffold
# the canonical target from the committed `.mcp.default.json` (the default auto-start
# pair — codegraph + headroom, zero-config, no token) when it is absent, mirroring how
# setup:local does. Write the target directly — GNU cp refuses to write through a
# dangling symlink, so `cp … .mcp.json` would fail on a fresh Linux clone. The other
# hosted servers (in `.mcp.example.json`) are opt-in via `pnpm mcp:setup` (most need a
# provider token). Web sessions load MCP from the platform environment settings (web
# UI), NOT this file, so we only report there. Best-effort and fail-open.
mcp_status="n/a"
if [ -f .mcp.json ]; then
  if command -v jq >/dev/null 2>&1; then
    mcp_status="$(jq -r '.mcpServers | keys | length' .mcp.json 2>/dev/null || echo '?') declared"
  else
    mcp_status="declared"
  fi
elif [ "${CLAUDE_CODE_REMOTE:-}" != "true" ] && [ -f .mcp.default.json ]; then
  if cp .mcp.default.json agent-os/mcp/mcp.json 2>/dev/null; then
    mcp_status="scaffolded default pair (codegraph + headroom)"
    echo "session-start: scaffolded .mcp.json from .mcp.default.json (codegraph + headroom); add the rest with \`pnpm mcp:setup\`." >&2
  else
    mcp_status="template only (run: pnpm mcp:setup:default)"
  fi
else
  mcp_status="platform-managed on web (configure in the environment MCP settings); local: pnpm mcp:setup"
fi

# --- Hook-health: surface pruning candidates from telemetry ------------------
# The README's "monthly ritual" (prune hooks silent 30+ days) previously relied
# on someone remembering to run `pnpm agent-os:hooks:report`. Enforce it
# passively instead: at session start, name any hook with recorded runs whose
# last `fired` entry is >30 days old (or that has NEVER fired across 50+ runs).
# Best-effort + fail-open; empty when telemetry is absent (fresh clone).
hook_health=""
telemetry_log="$ROOT/agent-os/hooks/.telemetry.log"
if [ -f "$telemetry_log" ]; then
  # ISO-8601 timestamps sort lexicographically, so "last fired before the
  # 30-day cutoff" is a plain string compare — portable across BSD/GNU awk.
  cutoff="$(date -u -v-30d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo '')"
  hook_health="$(awk -F, -v cutoff="$cutoff" '
    NF >= 4 {
      runs[$2]++
      if ($4 == "fired" && $1 > lastFired[$2]) lastFired[$2] = $1
    }
    END {
      for (hook in runs) {
        if (lastFired[hook] == "" && runs[hook] >= 50) printf "%s (never fired, %d runs) ", hook, runs[hook]
        else if (cutoff != "" && lastFired[hook] != "" && lastFired[hook] < cutoff) printf "%s (silent >30d) ", hook
      }
    }' "$telemetry_log" 2>/dev/null || echo "")"
fi
[ -n "$hook_health" ] && hook_health="
- Hook pruning candidates (silent 30+ days / never fired): ${hook_health}— review with \`pnpm agent-os:hooks:report\` (agent-os/hooks/README.md)"

# --- Agent tools vs their pins (tooling/setup/agent/tool-versions.sh) --------
# A cached environment keeps the versions it was built with; the installers move a
# machine to the pin only when they run. Name every tool that drifted so the banner
# says when to re-run bootstrap. Local `--version` calls only — no network.
tools_status="n/a"
if [ -f tooling/setup/agent/tool-install.lib.sh ]; then
  tools_status="$(last_probe tool-pins 'first check running') — re-checking in the background"
  (
    # shellcheck source=../../tooling/setup/agent/tool-install.lib.sh
    source tooling/setup/agent/tool-install.lib.sh
    # The five `--version` calls run in parallel (Python CLIs start slowly), one line each.
    tools_report="$(
      for tool_entry in codegraph:CODEGRAPH_VERSION:--version headroom:HEADROOM_VERSION:--version \
        semgrep:SEMGREP_VERSION:--version gitleaks:GITLEAKS_VERSION:version k6:K6_VERSION:version; do
        {
          IFS=: read -r tool_name tool_key tool_flag <<<"${tool_entry}"
          tool_current="$(installed_version "${tool_name}" "${tool_flag}")"
          printf '%s %s %s\n' "${tool_name}" "${tool_current:-missing}" "$(pinned_version "${tool_key}")"
        } &
      done
      wait
    )"
    tools_drifted=""; tools_at_pin=0; tools_total=0
    while read -r tool_name tool_current tool_pinned; do
      [ -n "${tool_name}" ] || continue
      tools_total=$((tools_total + 1))
      if [ "${tool_current}" = "${tool_pinned}" ]; then
        tools_at_pin=$((tools_at_pin + 1))
      else
        tools_drifted="${tools_drifted} ${tool_name} ${tool_current}≠${tool_pinned}"
      fi
    done <<<"${tools_report}"
    result="${tools_at_pin}/${tools_total} at pin"
    [ -n "${tools_drifted}" ] && result="${result} (${tools_drifted# } — run bash tooling/setup/agent/bootstrap.sh)"
    printf '%s\n' "${result}" >"${probe_directory}/tool-pins"
  ) </dev/null >/dev/null 2>&1 &
fi

# --- Live playground: bring the full stack up in the background (web) --------
# A web session is a playground: `bootstrap.sh` (setup → Postgres + Redis → migrate → demo
# seed → API + worker kept running) is launched detached, so the session starts at once and
# the stack goes live in the background; the banner tells the agent to wait for "live"
# before database/API work. Local sessions are untouched. Fail-open, like everything above.
stack_directory="${AGENT_STACK_DIR:-/tmp/agent-stack}"
stack_status="on demand (local session) — bash tooling/setup/agent/bootstrap.sh"
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  # A lock left by a run that is gone (or carried in from another boot) is stale, so a resumed
  # container launches a fresh bring-up instead of waiting on it forever.
  # shellcheck source=../../tooling/setup/agent/stack-lock.lib.sh
  source tooling/setup/agent/stack-lock.lib.sh 2>/dev/null || stack_lock_holder() { return 1; }
  if [ "$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:${PORT:-3000}/livez" 2>/dev/null)" = "200" ]; then
    stack_status="live — pnpm dev:stack:status"
  elif stack_lock_holder "${stack_directory}" >/dev/null; then
    stack_status="starting (bring-up already running) — tail -f ${stack_directory}/bootstrap.log"
  elif [ ! -x node_modules/.bin/biome ]; then
    stack_status="not started (dependencies missing) — bash tooling/setup/agent/bootstrap.sh"
  else
    mkdir -p "${stack_directory}"
    setsid nohup bash tooling/setup/agent/bootstrap.sh >"${stack_directory}/bootstrap.log" 2>&1 </dev/null &
    disown 2>/dev/null || true
    stack_status="starting in the background — follow: tail -f ${stack_directory}/bootstrap.log"
  fi
fi

# --- Build session context: skill routing map + env/commands summary --------
# The first line names the repository root the hooks ran from: the canary that shows this
# repository's hooks loaded (with telemetry's `be-session-start` row in agent-os/hooks/.telemetry.log),
# including in a session that holds several repositories (tooling/agent-os/session-hooks.ts).
node_version="$(node -v 2>/dev/null || echo unknown)"
deps="missing"; [ -x node_modules/.bin/biome ] && deps="installed"
codegraph="absent"; [ -f .codegraph/codegraph.db ] && codegraph="present"
gh_cli="absent"; command -v gh >/dev/null 2>&1 && gh_cli="$(gh --version 2>/dev/null | head -1 | awk '{print $3}')"
[ -n "$gh_cli" ] || gh_cli="absent"
# "provisioned" = the cached toolchain the Setup script builds (Node >=required + installed deps) is live in this session.
provisioned="no"; { [ "$node_ok" = "yes" ] && [ "$deps" = "installed" ]; } && provisioned="yes"
node_note=""; [ "$node_ok" = "no" ] && node_note="  (switch to Node >=${required_major} from .nvmrc, then pnpm install)"

map_file="$ROOT/agent-os/docs/skill-triggers.md"
map_section=""
[ -f "$map_file" ] && map_section="$(cat "$map_file")"

context="$(printf 'clinozy-be session ready (hooks from %s) — environment provisioned: %s.\n- Node %s (need >=%s) · deps %s · gh %s · codegraph %s · mcp %s · gitleaks %s · tools %s · agent-os %s · docker %s%s%s\n- Stack: %s\n- Web sessions go fully live on their own: bootstrap.sh (setup → Postgres + Redis → migrate → demo seed → API :3000 + worker :9090, kept running). Before any database/API work, wait until pnpm dev:stack:status says live.\n- Gates: pnpm validate · pnpm ci:local   (pre-commit: pnpm guard:pre-commit)\n- Custom commands: /be-validate · /be-ci-local · /be-new-domain · /be-routes-sync\n\nagent-os skill routing — consult be-skill-index FIRST, then run the listed skill(s) for the files you change:\n\n%s' \
  "$ROOT" "$provisioned" "$node_version" "$required_major" "$deps" "$gh_cli" "$codegraph" "$mcp_status" "$gitleaks_status" "$tools_status" "$agent_os_status" "$docker_status" "$node_note" "$hook_health" "$stack_status" "$map_section")"

# Prefer the structured additionalContext envelope; fall back to plain stdout
# (also injected as context) when jq is unavailable. Fail-open either way.
if command -v jq >/dev/null 2>&1; then
  jq -cn --arg c "$context" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
else
  printf '%s\n' "$context"
fi
