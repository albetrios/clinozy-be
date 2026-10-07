# Cloud agent instructions (clinozy-be)

Read this on **remote / cloud** sessions (Cursor Cloud Agents, Claude Code on the web)
before tasks that need Postgres, Redis, migrations, seeds, or a live API.

Canonical config: [`agent-os/cloud-environment/`](./) (`environment.json`) and the one setup
script, [`bootstrap.sh`](../../tooling/setup/agent/bootstrap.sh) (`--install-only` in the cached
install step).

**Skills, MCPs, subagents:** [`skills-and-mcps.md`](skills-and-mcps.md) — default pair
(`codegraph`, `headroom`) is installed and written to `.mcp.json` by `bootstrap.sh`; on-demand
MCPs and the full skill catalog are listed there.

## When to run bring-up

| Task needs | Run bring-up? |
| ---------- | ------------- |
| Lint, typecheck, unit tests, `pnpm agent-os:check` | No |
| E2E, integration, `pnpm test`, migrations | Yes |
| `pnpm dev`, `pnpm dev:worker`, `/readyz`, API smoke | Yes |

## One-command bring-up

```bash
export PATH="/opt/node24/bin:$HOME/.local/bin:$PATH"
bash tooling/setup/agent/bootstrap.sh
```

Leaves Postgres + Redis up; starts the app only for the healthcheck, then stops it.
To keep the API running:

```bash
KEEP_APP=1 bash tooling/setup/agent/bootstrap.sh
```

Or start manually after bootstrap:

```bash
pnpm dev          # API (tmux / background)
pnpm dev:worker   # BullMQ workers
bash tooling/setup/agent/healthcheck.sh
```

## Step-by-step (same as local)

```bash
export PATH="/opt/node24/bin:$HOME/.local/bin:$PATH"
SONAR=0 pnpm compose:up && pnpm compose:wait
pnpm db:migrate && pnpm setup:local --only-env && pnpm db:seed
pnpm dev &
bash tooling/setup/agent/healthcheck.sh
```

## Restricted Docker VMs

`bootstrap.sh` retries automatically: if standard `compose:up` fails (overlay mount or
cgroup errors), it switches Docker to **restricted VFS** mode and uses the
[`docker-compose.cloud-agent.yml`](../../tooling/setup/agent/docker-compose.cloud-agent.yml)
override (host network + `cgroupns_mode: host` for Postgres).

Manual fallback:

```bash
FORCE_RESTRICTED_VFS=1 bash tooling/setup/agent/ensure-docker-daemon.sh
docker compose -f docker-compose.yml -f tooling/setup/agent/docker-compose.cloud-agent.yml up -d postgres redis
```

## Health endpoints

- `GET /livez` — process up (200)
- `GET /readyz` — Postgres + Redis + BullMQ (200 or 503)

## MCP default pair

`bootstrap.sh` installs `codegraph` and `headroom` to `~/.local/bin` (`codegraph` is linked
there from the pinned Node's bin, so the platform's `PATH` finds it) and runs
`pnpm mcp:setup:default` (same as local `pnpm setup:local`). If MCP tools are missing in a
session, run `pnpm tool:agent-tools --smoke` (starts each server and lists its tools), confirm
platform MCP settings match [`.mcp.default.json`](../../.mcp.default.json), and start a fresh
session.

## Agent tool versions

`codegraph`, `headroom`, `semgrep`, `gitleaks` and `k6` are pinned in
[`tool-versions.sh`](../../tooling/setup/agent/tool-versions.sh). The session-start banner says
`tools 5/5 at pin` or names the drifted tool — then run `bash tooling/setup/agent/bootstrap.sh`
(each installer moves the machine to its pin). `pnpm tool:agent-tools --outdated` lists newer
releases with the lines to paste for a bump PR. Policy and upgrade flow:
[Tool versions](../../docs/integrations/claude-code-web-environment.md#tool-versions-pinned-checked-at-install). For **be-stack-monitor**, add `dashboards` via
`pnpm mcp:setup dashboards` after `pnpm dashboards:up` — see [`skills-and-mcps.md`](skills-and-mcps.md).
