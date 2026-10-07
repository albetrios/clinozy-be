# Pinned versions of the agent tooling the cloud bootstrap installs — one place, read by:
#   - tooling/setup/agent/install-*.sh (via tool-install.lib.sh): each installer moves the
#     machine TO the pin — installs when missing, reinstalls when the installed version differs
#   - CI (.github/workflows/pr-ci.yml, scheduled-k6-load-slo.yml): appends these lines to
#     $GITHUB_ENV, so CI and cloud sessions run the same versions
#   - `pnpm tool:agent-tools` (tooling/dev/check-agent-tools.ts): installed vs pin, MCP smoke,
#     and `--outdated` — the newest release plus paste-ready lines for a bump
#
# Format: plain KEY=value lines only — no quotes, no spaces, no expansions — so bash can
# `source` the file and GitHub Actions can append it to $GITHUB_ENV unchanged.
#
# Bump: run `pnpm tool:agent-tools --outdated`, paste the printed lines here (a version and
# its checksums move together), open a PR — CI installs and runs the new version before it
# lands. Rollback: revert the line; every session moves back on its next bootstrap.
#
# Trial without a commit: set the KEY (and, for downloaded binaries, its *_SHA256_* keys) as
# variables on a separate cloud environment; an environment variable overrides the pin here.
#
# Not here: Node (.nvmrc), pnpm (package.json `packageManager`), Docker images (compose
# files, bumped by Dependabot), gh and the Docker engine (platform fallbacks).

# CodeGraph (npm: @colbymchenry/codegraph) — semantic code index + MCP server.
CODEGRAPH_VERSION=1.6.2

# Headroom (PyPI: headroom-ai, `mcp` extra) — context-compression MCP server.
HEADROOM_VERSION=0.40.0

# semgrep (PyPI) — `pnpm security:sast` and the CI SAST job.
SEMGREP_VERSION=1.179.0

# gitleaks (github.com release binary) — pre-commit staged-secrets scan and the CI secret scan.
GITLEAKS_VERSION=8.30.1
GITLEAKS_SHA256_LINUX_X64=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
GITLEAKS_SHA256_LINUX_ARM64=e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080

# k6 (github.com release binary) — `pnpm load:*` and the scheduled CI load job.
K6_VERSION=2.3.0
K6_SHA256_LINUX_AMD64=39c3117b6af817592dcd0ce4242105c0a7af10948c2a425306f0be8f7a8a8ab1
K6_SHA256_LINUX_ARM64=5ca3433e8201da72a284aaa241a1bb5fb47f4abb4e384d39410ddd8062f49b90
