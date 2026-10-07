# agent-os/cloud-environment — shared cloud agent setup

Single source of truth for **cloud session** bring-up (Cursor Cloud Agents, Claude Code
on the web, and similar remote Linux VMs). Local human setup stays in
[docs/getting-started/setup.md](../../docs/getting-started/setup.md).

Implementation scripts live in [`tooling/setup/agent/`](../../tooling/setup/agent/)
(Node, Docker, bootstrap, healthcheck). This directory holds the **policy** agents and
operators copy into each platform's environment config.

## Layout

| File | Purpose |
| ---- | ------- |
| [`environment.json`](environment.json) | Cursor Cloud Agents — `install`, `start`, optional `terminals` |
| [`bootstrap.sh`](../../tooling/setup/agent/bootstrap.sh) | The one setup script: `--install-only` = idempotent cached install (tools + deps + MCP default pair + `.env.local`); no flag = that plus the full stack bring-up |
| [`agents-cloud.md`](agents-cloud.md) | On-demand stack instructions every agent reads via `AGENTS.md` |
| [`skills-and-mcps.md`](skills-and-mcps.md) | Which MCPs, skills, and subagents cloud sessions use |

## How each platform picks it up

| Platform | Config location | What to wire |
| -------- | --------------- | ------------ |
| **Cursor** | [`.cursor/environment.json`](../../.cursor/environment.json) → symlink here | `install` runs `bootstrap.sh --install-only`; optional `start` / `terminals` from `environment.json` |
| **Cursor dashboard** | Cloud Agents → Environment → Install script | `bash tooling/setup/agent/bootstrap.sh --install-only` |
| **Claude Code on the web** | Environment → Setup script field | `bash tooling/setup/agent/bootstrap.sh --install-only` (see [claude-code-web-environment.md](../../docs/integrations/claude-code-web-environment.md)) |
| **All agents** | [`AGENTS.md`](../../AGENTS.md) → [`agents-cloud.md`](agents-cloud.md) | `bootstrap.sh` (no flag) in the session when DB/API/workers are needed |

> In the cached `install` / Setup step, always pass **`--install-only`**: it stops before
> Docker, because a Docker failure there marks the whole environment as failed and no
> running container survives the cache anyway. Run the full `bootstrap.sh` **in the session**
> (see `agents-cloud.md`); it auto-retries with restricted VFS + the cloud-agent compose
> override when standard compose fails.

## Network allowlist (cloud)

Minimum Custom allowlist entry beyond defaults:

- `nodejs.org` — Node 24 install (`install-node.sh`)

For Docker image pulls without the GCR mirror script, also add
`production.cloudfront.docker.com`. Prefer
[`install-docker-images.sh`](../../tooling/setup/agent/install-docker-images.sh), which
`bootstrap.sh` already runs.

## MCP, skills, and subagents

**Full reference:** [`skills-and-mcps.md`](skills-and-mcps.md)

`bootstrap.sh` installs the **default MCP pair** and scaffolds [`.mcp.json`](../../.mcp.json):

| Server | Command | Installed by |
| ------ | ------- | ------------ |
| `codegraph` | `codegraph serve --mcp` | `install-codegraph.sh` |
| `headroom` | `headroom mcp serve` | `install-headroom.sh` + `pnpm mcp:setup:default` |

On-demand MCPs (`dashboards`, `clinozy-be:api`, hosted integrations): `pnpm mcp:setup <name>`.
Project skills (43): start at [`be-skill-index`](../../agent-os/skills/be-skill-index/SKILL.md).

## Related

- [cursor-cloud-agent-environment.md](../../docs/integrations/cursor-cloud-agent-environment.md) — image + GitHub prerequisites
- [claude-code-web-environment.md](../../docs/integrations/claude-code-web-environment.md) — tiers, env vars, full bootstrap option
- [Cursor Cloud Agent setup](https://cursor.com/docs/cloud-agent/setup) — platform docs for `environment.json`
