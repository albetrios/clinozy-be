# CodeGraph (semantic code index for AI agents)

[CodeGraph](https://github.com/colbymchenry/codegraph) (`@colbymchenry/codegraph`) builds a local **SQLite knowledge graph** of every symbol, edge, and file in this repo under `.codegraph/`, and exposes it to AI agents (Cursor, Claude Code) over an **MCP server**. Agents query the pre-built index instead of grep + read loops, which cuts tool calls and token cost for "how does X work", "what calls this", and impact-analysis questions.

It is wired into **`pnpm setup:local`** so a fresh clone gets a working index with **no manual steps** — the only thing a developer does afterward is restart their agent so the MCP server loads.

> CodeGraph complements, and does not replace, the canonical architecture docs: [project-structure-guide.md](../reference/architecture/project-structure-guide.md) and [domains-and-public-api-design.md](../reference/architecture/domains-and-public-api-design.md). For the LLM knowledge-graph / onboarding workflow, see [understand-anything.md](understand-anything.md) — that is a separate tool.

---

## What is committed vs generated per machine

The index is **machine-local and regenerable** — it is never committed. Only the configuration that makes the integration reproducible is tracked.

| Path | Tracked? | Purpose |
| --- | --- | --- |
| `.mcp.example.json` | **committed** | Secret-free Claude Code MCP template (all servers, `${CONTEXT7_API_KEY}` placeholder, no machine path). |
| `.mcp.json` | **committed symlink** | Claude Code MCP config — a tracked symlink to the gitignored `agent-os/mcp/mcp.json`, where the real config (live keys) lives. Written through the link by `pnpm mcp:setup` / `setup:local` / the cloud bootstrap. |
| `.cursor/mcp.example.json` | **committed** | Secret-free Cursor MCP template (all servers, `${CONTEXT7_API_KEY}` placeholder, no machine path). |
| `.cursor/mcp.json` | **committed symlink** | Cursor MCP config — a tracked symlink to the same gitignored `agent-os/mcp/mcp.json`. |
| `agent-os/mcp/mcp.json` | gitignored | The real MCP config both links point to; holds live API keys, so it is never committed. |
| `.codegraph/.gitignore` | **committed** | Keeps the index DB, cache, logs, and daemon runtime files out of git. |
| `.codegraph/codegraph.db` | gitignored | The ~26 MB SQLite index. Built per machine. |
| `.codegraph/daemon.sock`, `daemon.pid`, `cache/`, `*.log` | gitignored | Local MCP daemon runtime files. |
| `.claude/settings.json` | **committed symlink** | Claude Code settings (hooks + auto-allow permissions, incl. the `codegraph_*` tools) — a tracked symlink to the generated `agent-os/platforms/claude/settings.json`. |

Because the DB and the real MCP config are gitignored, they **survive branch switches** (they are not part of any commit) and are **rebuilt on each teammate's machine** the first time they run `setup:local`.

> **Never run `codegraph install --location=local` in this repo.** It replaces the committed `.mcp.json`, `.cursor/mcp.json` and `.claude/settings.json` symlinks with plain files (a dirty tree that must not be committed), and without `--init` it builds no index. Build the index with `codegraph init` and declare the MCP server with `pnpm mcp:setup:default`. If it already ran, restore the links with `git checkout -- .mcp.json .cursor/mcp.json .claude/settings.json`.

---

## Automatic setup (`pnpm setup:local`)

The local bootstrap runs CodeGraph as **phase `7/9`**. It is idempotent and non-fatal (a failure logs a warning and never blocks the rest of the bootstrap):

```mermaid
flowchart TD
  A[setup:local phase 7/9] --> B{codegraph CLI at the pinned version?}
  B -- "no (missing or another version)" --> C["npm i -g @colbymchenry/codegraph@CODEGRAPH_VERSION"]
  B -- yes --> D{codegraph.db exists?}
  C --> D
  D -- no, fresh clone --> E["codegraph init<br/>(full index)"]
  D -- yes --> F["codegraph sync<br/>(fast incremental refresh)"]
```

- **Version** — pinned as `CODEGRAPH_VERSION` in [`tooling/setup/agent/tool-versions.sh`](../../tooling/setup/agent/tool-versions.sh), the same pin the cloud bootstrap installs; a missing CLI or another installed version is replaced with the pin. Bump policy: [Tool versions](claude-code-web-environment.md#tool-versions-pinned-checked-at-install).
- **First run / fresh clone** — `codegraph.db` is absent, so it runs `codegraph init` (after installing the pinned CLI if needed), which builds the index from the current working tree.
- **Subsequent runs** — the DB exists, so it runs the fast incremental `codegraph sync`.
- **MCP config** — the next step declares the `be-codegraph` server (with `be-headroom`) in `.mcp.json`, writing through the symlink, so Claude Code and Cursor both pick it up.
- **Skip it** — `pnpm setup:local --skip-codegraph`.

> After the first run, **restart your agent** (Cursor / Claude Code) so it loads the new `be-codegraph` MCP server. This is the one manual step CodeGraph requires.

### Cloud sessions

The cloud bootstrap runs [`install-codegraph.sh`](../../tooling/setup/agent/install-codegraph.sh): the pinned CLI, then `codegraph init` / `sync` — the same flow as above. The global install lands in the pinned Node's bin (`/opt/node24/bin`), which the process that launches MCP servers does not have on its `PATH`, so the script also links `codegraph` into `~/.local/bin`. `pnpm tool:agent-tools --smoke` starts the server exactly as an MCP client does and lists its tools.

---

## Manual setup (without `setup:local`)

```bash
npm i -g "@colbymchenry/codegraph@$(sed -n 's/^CODEGRAPH_VERSION=//p' tooling/setup/agent/tool-versions.sh)"   # the pinned version
codegraph init           # build the index
pnpm mcp:setup:default   # declare be-codegraph + be-headroom in .mcp.json (Claude Code + Cursor share it)
# `pnpm mcp:setup` for the full set; then replace ${CONTEXT7_API_KEY} etc. — the be-codegraph entry needs no edits
```

`codegraph install --print-config cursor` prints the MCP snippet without writing any files.

---

## CLI reference (most used)

| Command | Purpose |
| --- | --- |
| `codegraph status` | Index statistics and freshness. |
| `codegraph sync` | Incremental re-index of changed files (fast). |
| `codegraph index --force` | Full rebuild. |
| `codegraph query <search>` | Search symbols by name. |
| `codegraph context <task>` | Build AI context (entry points + related symbols + code) for a task. |
| `codegraph serve --mcp --path <repo>` | Start the MCP server over stdio (this is what agents launch). |

## MCP tools exposed to agents

`codegraph_search`, `codegraph_context`, `codegraph_trace`, `codegraph_callers`, `codegraph_callees`, `codegraph_impact`, `codegraph_node`, `codegraph_explore`, `codegraph_files`, `codegraph_status`.

---

## Git and CI

- The index DB and daemon runtime files are **never committed** (see `.codegraph/.gitignore`); each developer builds their own from their checkout.
- **Auto-refreshed on branch switch / pull.** [`.husky/post-checkout`](../../.husky/post-checkout) and [`.husky/post-merge`](../../.husky/post-merge) run `codegraph sync -q` in the background so the index tracks the working tree with zero manual effort. Both are **guarded** (no-op when `codegraph` or the index is absent — CI, web sessions) and **backgrounded** (never block the git command). `codegraph sync` is a local, incremental re-index, so it costs **no LLM tokens** — and a fresh index actually *lowers* agent token use (accurate `codegraph_*` queries replace whole-file reads). Pinned by `src/tests/unit/ci/codegraph-git-hooks.policy.unit.test.ts`.
- The real MCP config (`agent-os/mcp/mcp.json`) is **gitignored** because it may hold live API keys and machine-specific paths; `.mcp.json` and `.cursor/mcp.json` are committed symlinks to it. Only the secret-free templates (`.mcp.example.json`, `.cursor/mcp.example.json`) are committed in full; `setup:local` writes the real config per machine.
- CI does not run CodeGraph; the index is developer-local.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Agent does not show `codegraph_*` tools | Restart the agent (Cursor / Claude Code) so it loads the MCP server from `.cursor/mcp.json` / `.mcp.json`. |
| `CodeGraph not initialized` | Run `codegraph init` (or `pnpm setup:local`) from the repo root. |
| `git status` shows `T .mcp.json` / `T .claude/settings.json` | A local `codegraph install` replaced the symlinks — `git checkout -- .mcp.json .cursor/mcp.json .claude/settings.json`, then `pnpm mcp:setup:default`. |
| `codegraph: command not found` | `pnpm setup:local` (local) or `bash tooling/setup/agent/install-codegraph.sh` (cloud) — both install the pinned version. |
| MCP server fails at session start: `Executable not found in $PATH: codegraph` (ENOENT) | The CLI is only under `/opt/node24/bin`; re-run `bash tooling/setup/agent/install-codegraph.sh` to link it into `~/.local/bin`, then start a fresh session. |
| Index out of date | `codegraph sync` (incremental) or `codegraph index --force` (full rebuild). |
| Stale tools after a large refactor | `codegraph index --force`. |

---

## Related docs

- [understand-anything.md](understand-anything.md) — separate LLM knowledge-graph / onboarding tool.
- [cursor-backend-mcp.md](cursor-backend-mcp.md) — MCP for calling the live clinozy-be API from another repo.
- [cursor-cloud-agent-environment.md](cursor-cloud-agent-environment.md) — cloud-agent Docker setup.
- [getting-started/setup.md](../getting-started/setup.md) — local setup and `setup:local`.
