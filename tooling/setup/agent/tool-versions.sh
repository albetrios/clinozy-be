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
# Also here, outside AGENT_TOOLS (tooling/dev/agent-tools.ts): Node, gh and the Railway CLI,
# release downloads the setup scripts and the deploy verify (H-2, H-12). `pnpm tool:agent-tools --outdated` does not cover them; their
# checksums come from the upstream files named beside them.
#
# Not here: pnpm (package.json `packageManager`), Docker images (compose files, pinned by digest
# and bumped by Dependabot) and the Docker engine (a platform fallback).

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

# Node.js (nodejs.org release tarball) — install-node.sh refuses a download whose SHA-256 differs
# (H-12). NODE_VERSION is .nvmrc's exact version (agent-tool-versions.policy.unit.test.ts holds
# them equal); the checksums are from https://nodejs.org/dist/v<version>/SHASUMS256.txt.
NODE_VERSION=24.21.0
NODE_SHA256_LINUX_X64=fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6
NODE_SHA256_LINUX_ARM64=6ad1325edbdb5649c379b75a237147a666c95d4f9ae8d340fef2d1575d289ad2

# gh (github.com/cli/cli release tarball) — install-gh.sh, when the image has no gh. Checksums from
# the release's gh_<version>_checksums.txt.
GH_VERSION=2.89.0
GH_SHA256_LINUX_AMD64=d0422caade520530e76c1c558da47daebaa8e1203d6b7ff10ad7d6faba3490d8
GH_SHA256_LINUX_ARM64=9e64a623dfc242990aa5d9b3f507111149c4282f66b68eaad1dc79eeb13b9ce5

# Railway CLI (github.com/railwayapp/cli release binary) — install-railway.sh, which the Railway
# deploy runs before any secret is in reach (H-2). The release publishes no checksum file: these
# are the SHA-256 of the two release assets, taken when the version was pinned.
RAILWAY_VERSION=5.71.0
RAILWAY_SHA256_LINUX_X64=2e682fd2ddf8d6fdf9e46d9d99d99646ff0022a6abb0c2bca93011348a269fb9
RAILWAY_SHA256_LINUX_ARM64=d160ad2a029eaac4b4c85012adb67c1f5709ba81f7320edb5a27be928211d638
