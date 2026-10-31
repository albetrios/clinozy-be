# Agent platform access (clinozy-be)

All project agents in [`agent-os/agents/`](../agents/) are **read-only** — they run in
isolation, produce a structured report, and never edit files. To apply findings,
invoke the wrapping skill inline in the main conversation.

## How to invoke on each platform

| Tool | How to invoke |
| ---- | ------------- |
| **Cursor** | `@<agent-name>` in Agent mode; model also auto-invokes from the `description` frontmatter field |
| **Claude Code** | `"Read agent-os/agents/<agent-name>.md and follow the procedure"` |
| **Codex** | Listed in `AGENTS.md` custom subagents table — invoke by name in your prompt |

Replace `<agent-name>` with the agent's `name:` frontmatter value (e.g. `be-dependency-auditor`).

## All agents

See [agents-catalog.md](agents-catalog.md) for the full catalog with
use-when descriptions and the skills each agent wraps.

## Claude Code permissions

`agent-os/platforms/claude/settings.json` (`.claude/settings.json`) holds the permission rules; the
generator keeps them by hand and only derives the `hooks` block. Claude Code checks `deny`, then
`allow`; there is no `ask` list, and no hook returns `ask` — a call neither list covers is the
permission mode's to decide (auto mode decides it without a prompt).

| List | Rules | Why |
| ---- | ----- | --- |
| `allow` | the gates (`pnpm validate*`, `test*`, `lint*`, …), `pnpm iteration*`, `pnpm db*`, `pnpm exec` (a binary already installed — a single Vitest file, tsx), `git add` / `commit` / `push` / `switch`, `gh run`, codegraph, headroom, and the read-only GitHub MCP tools (`get_*`, `list_*`, `search_*`, PR, issue and Actions reads) | the commands an agent chains run without a prompt; `main` stays protected by its ruleset |
| `deny` | `git push --force`, `git push -f`, `rm -rf`, `mcp__github__delete_file` | never run by an agent; `be-guardrails.mjs` blocks the shell ones too |

Every other GitHub MCP write (comments, PRs, merges, file edits) is the permission mode's call. In a session that
holds several repositories, `pnpm agent-os:session-hooks` merges each repository's rules into the
session root's `.claude/settings.json`, because a repository's own settings contribute no
permission rules there: `allow` and `deny` beside the root's own rules, `ask` rebuilt from the
repositories on every run (an ask outranks every allow, so a dropped one would keep prompting).
Neither repository declares an ask, so the rebuilt list keeps only the root's hand-added ones. Pinned by `src/tests/unit/tooling/agent-permissions.policy.unit.test.ts`.
