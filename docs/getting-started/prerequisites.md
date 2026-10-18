# Prerequisites (external tools)

Everything the project needs that `pnpm install` **cannot** provide — global CLIs,
non-npm binaries, Python tools, and a container runtime. On **macOS** these are
installed and upgraded automatically by `pnpm setup:local` (see below); other
operating systems are not wired up yet (the installer no-ops off macOS).

All installs come from **authenticated sources only** — Homebrew's official
checksummed formulae, the npm registry, and PyPI — and run **non-interactively**
(no prompts/pauses).

## Auto-installed on macOS by `pnpm setup:local`

Run once on a fresh machine — it installs Homebrew if missing, then installs (or
**upgrades**, if already present) each tool below. It is idempotent and re-run-safe;
skip it with `pnpm setup:local --skip-mac-tools`, or run it on its own with
`pnpm setup:mac-tools` (`--check` for a dry-run that changes nothing).

The tool list is **data-driven** from [`tooling/dev/setup-prerequisites-mac-tools.manifest`](../../tooling/dev/setup-prerequisites-mac-tools.manifest)
— the single source of truth. Add or remove a line there to change what setup
installs; the script (`tooling/dev/setup-mac-tools.sh`) just dispatches each entry.

| Tool | Why | Source (authenticated) |
| --- | --- | --- |
| **Homebrew** | package manager for everything below | official installer (`NONINTERACTIVE=1`), Homebrew GitHub organization |
| **Node.js** (`.nvmrc` major — 24) | runtime; pnpm via `corepack` | Homebrew — only if missing/older than `.nvmrc` (an existing nvm/fnm Node is left alone) |
| **gitleaks** | pre-commit + CI secret scan | Homebrew |
| **gh** | GitHub CLI (env/ruleset sync, PR tooling) | Homebrew |
| **jq** | JSON in shell/CI scripts | Homebrew |
| **uv** | runtime for the `uvx` MCP servers | Homebrew |
| **pipx** | isolated host for the `headroom` Python CLI | Homebrew |
| **Docker runtime** | Postgres/Redis/Sonar/Toxiproxy via Compose | Homebrew **`colima`** (headless) — **only if no runtime exists**; an existing OrbStack / Docker Desktop is respected |

> **Fresh-machine bootstrap** (only bash + curl needed): `bash tooling/dev/setup-mac-tools.sh`
> installs Homebrew + Node + all tools first — then `pnpm install && pnpm setup:local`.

## Agent tools — pinned, installed by `pnpm setup:local`

The agent CLIs are not in the Homebrew manifest: an install-or-upgrade there would move them
off their pins on every run. `pnpm setup:local` installs each at the version pinned in
[`tooling/setup/agent/tool-versions.sh`](../../tooling/setup/agent/tool-versions.sh) — the same
pins the cloud bootstrap and CI use — and replaces a different installed version.

| Tool | Why | Source (pinned) |
| --- | --- | --- |
| **codegraph** (`@colbymchenry/codegraph`) | code-intelligence MCP index | npm registry — `CODEGRAPH_VERSION` |
| **headroom** (`headroom-ai[mcp]`) | context-compression MCP | PyPI via `uv` / `pipx` — `HEADROOM_VERSION` |

Check them with `pnpm tool:agent-tools --smoke` (installed vs pin + an MCP handshake);
`--outdated` lists newer releases. Bumps: **be-dependency-security**.

## Not installed automatically (out of scope / optional)

| Tool | When you need it | How |
| --- | --- | --- |
| **railway** / **neonctl** CLIs | deploy / infra ops | npm global, or via their MCP servers |
| **trivy** · **codeql** · **actionlint** | run in CI | installed by the CI workflows, not locally |
| **semgrep** · **k6** | `pnpm security:sast` · `pnpm load:*` (and CI) | cloud sessions get the pinned versions from the bootstrap; locally `brew install semgrep k6` (`tool-versions.sh` holds the pins CI uses) |
| the ~15 provider MCP servers (be-context7, stripe, sentry, …) | opt-in agent tooling | `pnpm mcp:setup <names>` + provider tokens; runtimes self-fetch via `npx`/`uvx`/Docker |

## Docker images (pulled by Compose, not host installs)

`postgres:17.10` · `redis:8.6.3` · `sonarqube:25.5.0` + `sonar-scanner-cli:11` ·
`clinozy-be-toxiproxy:2.12.0` — pulled on `pnpm compose:up` / `pnpm sonar:up`.

## Notes

- **CI parity for gitleaks:** CI and cloud sessions install `GITLEAKS_VERSION` from
  `tooling/setup/agent/tool-versions.sh`; Homebrew installs the latest. The scan
  configuration is stable across gitleaks minors, so this is fine in practice —
  `pnpm tool:agent-tools` shows the drift; pin locally only if a scan result diverges.
- **Non-macOS:** the installer is macOS-gated for now. Adding a Linux branch later is
  a localized change in `tooling/dev/setup-mac-tools.sh` (the `uname -s` guard).
