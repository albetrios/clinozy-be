---
name: be-dependency-security
description: Keeps pnpm dependencies non-vulnerable and avoids breaking changes when updating — and owns the pinned agent-tool versions (codegraph, headroom, semgrep, gitleaks, k6) in tooling/setup/agent/tool-versions.sh. Use when adding/updating dependencies, when CI audit fails, when reviewing package.json / pnpm-lock.yaml, or when bumping an agent tool pin.
trigger: package.json, pnpm-lock.yaml, tooling/setup/agent/tool-versions.sh
triggerNote: Zero-vuln dependency updates + agent tool pin bumps
indexNote: keep pnpm deps non-vulnerable; safe patch/minor updates
---

# Dependency security (clinozy-be)

Keep **zero known vulnerabilities** in dependencies and avoid **breaking changes** when updating. Follow this skill whenever you add, upgrade, or change dependencies.

## Non-negotiable

1. **No vulnerabilities** — `pnpm audit` must pass with no findings. CI runs `pnpm deps:audit` and `pnpm deps:audit:prod` (fail on any severity).
2. **No breaking changes by default** — Prefer patch/minor updates; use overrides for transitive vulns before bumping direct deps to a new major.

## Workflow

### When adding or updating a dependency

1. **Install or update**
   - New package: `pnpm add <package>` or `pnpm add -D <package>` (use exact or caret range per project convention).
   - Update existing: use `pnpm update` (respects semver in package.json) or `pnpm update <package>` for a single package. Prefer this over `pnpm add package@latest` to avoid accidental major jumps.

2. **Run audit**

   ```bash
   pnpm install
   pnpm audit
   ```

   If audit reports vulnerabilities, fix them (see below) before committing.

3. **Avoid breaking changes**
   - Prefer `pnpm update` (patch/minor within declared ranges). For a major upgrade, do it intentionally: update one package, run `pnpm validate` and `pnpm test`, fix any breakage, then commit.

4. **Validate and test**

   ```bash
   pnpm validate
   pnpm test
   ```

   Do not commit dependency changes without passing validate and tests.

### When `pnpm audit` reports vulnerabilities

1. **Try automatic fix (limited)**

   ```bash
   pnpm audit fix
   ```

   Often does not resolve transitive vulns; proceed to overrides if needed.

2. **Use `overrides` in `pnpm-workspace.yaml` for transitive vulnerabilities**
   - When a **transitive** dependency (e.g. pulled in by `drizzle-kit` or `openapi-to-postmanv2`) has a known vulnerability, add or update an override in `pnpm-workspace.yaml` under the top-level `overrides:` key to force a patched version:

   ```yaml
   overrides:
     # lift only the vulnerable versions, onto the patched release of the same major
     'package-name@<patched.version': '^patched.version'
     # no fix on the major a dependency pins: confine the jump to that dependency
     'parent-package>package-name': '^patched.version'
   ```

   - Look up the advisory (e.g. GitHub Advisory or `pnpm audit` output) for the **patched version** of each major line.
   - **Never an open-ended floor** (`package-name: '>=patched.version'`): it moves every consumer onto whatever major is newest, and a capped range (`'>=x <y'`) can pull a consumer of the next major back down. Both happened here (rollup 2→4, minimatch 3→10, undici and fast-uri held below the major fastify and jsdom declare).
   - Name the advisory, the fixed version and the dependency that pins the vulnerable one in a comment above the entry.
   - **Remove an entry once nothing needs it**: delete it, run `pnpm install --lockfile-only` and `pnpm deps:audit`; if the audit stays clean, the entry goes.
   - A dependency patched under `patchedDependencies` is pinned to the exact version the patch is keyed on, so a range cannot resolve past the patch.
   - Run `pnpm install --no-frozen-lockfile` to refresh the lockfile, then `pnpm audit` again. Commit both `pnpm-workspace.yaml` and `pnpm-lock.yaml`.

3. **Upgrade direct dependency only if necessary**
   - If the vulnerable package is a **direct** dependency, prefer upgrading it to a patched version (e.g. `pnpm add package@^patched.version`) and run tests. If the only fix is a major upgrade, do it explicitly and run full test suite + fix breakage.

4. **Never leave known vulnerabilities**
   - Do not commit with `pnpm audit` failing. CI will fail. Resolve via overrides or upgrades until `pnpm audit` reports "No known vulnerabilities found."

## Agent tool pins (`tooling/setup/agent/tool-versions.sh`)

The CLIs the cloud bootstrap, `setup:local` and CI install — `codegraph`, `headroom`, `semgrep`,
`gitleaks`, `k6` — are pinned in **one file** of plain `KEY=value` lines: a version per tool and,
for each github.com release binary, a SHA-256 per architecture. Every installer moves the
machine to the pin (reinstalls a different version) and refuses a download whose checksum does
not match; CI appends the same file to `$GITHUB_ENV`. Policy and upgrade flow:
[`docs/integrations/claude-code-web-environment.md` → Tool versions](../../../docs/integrations/claude-code-web-environment.md#tool-versions-pinned-checked-at-install).

**Bump workflow**

1. `pnpm tool:agent-tools --outdated` — lists each pin vs the newest release and prints the exact
   lines to paste (version **and** checksums; never hand-type a hash). The cloud bootstrap runs
   the same report at every install.
2. Read the tool's release notes for breaking changes (a CLI that rewrites repo files, a changed
   MCP tool set, a dropped flag) — the reason these are pinned at all.
3. Paste the lines into `tool-versions.sh`; nothing else holds a version.
4. Verify locally: `bash tooling/setup/agent/install-<tool>.sh` (moves to the new pin),
   `pnpm tool:agent-tools --smoke`, and the tool's own gate (`pnpm security:sast`,
   `pnpm load:health`, a commit for gitleaks).
5. One PR per bump — CI installs and runs the new version before it lands. **Rollback** = revert
   the line; every session moves back on its next bootstrap.

**Trial without a commit:** set the key (and its `*_SHA256_*` keys) as variables on a separate
cloud environment — an environment variable overrides the pin. A version override without its
checksum is refused.

**Never:** install an agent tool unpinned (`@latest`, a bare `pip install semgrep`, `pipx upgrade`),
copy a version into a workflow, doc or script, or commit a pin without its checksums —
`src/tests/unit/tooling/agent-tool-versions.policy.unit.test.ts` fails on each.

## Scripts (package.json)

| Script | Purpose |
| --- | --- |
| `pnpm deps:audit` | Run `pnpm audit` (same as CI; must pass). |
| `pnpm deps:audit:prod` | Run `pnpm audit --prod` (production dependency tree only; same as CI quality job). |
| `pnpm deps:update` | Run `pnpm update --recursive` for safe patch/minor updates within current ranges. Run `pnpm audit` and `pnpm validate` + `pnpm test` after. |

## CI

- **Quality job** runs `pnpm install --frozen-lockfile` then `pnpm deps:audit` and `pnpm deps:audit:prod`. Any vulnerability fails the job.
- **Dependabot CI triage** ([`.github/workflows/dependabot-ci-triage.yml`](../../../.github/workflows/dependabot-ci-triage.yml)) opens an issue when PR CI fails on a Dependabot PR. All dependency PRs are merged manually after review. Branch protection must require **PR CI / Security audit**, **PR CI / Security secrets**, and **PR CI / Security SAST** so a merged dependency PR cannot skip audit, secret detection, or SAST.
- Keep `overrides` in `pnpm-workspace.yaml` when needed so that the lockfile (frozen in CI) already contains patched versions.

## Checklist (after any dependency change)

1. [ ] `pnpm install` (or `pnpm install --no-frozen-lockfile` if you added/updated overrides).
2. [ ] `pnpm audit` — must report no vulnerabilities.
3. [ ] `pnpm validate` — lint, format, typecheck pass.
4. [ ] `pnpm test` — full test suite passes.
5. [ ] Commit `pnpm-workspace.yaml` (if overrides changed) or `package.json` (if direct deps changed) and `pnpm-lock.yaml` together; do not commit lockfile with failing audit.

## Reference

- **Overrides**: [pnpm overrides](https://pnpm.io/package_json#pnpmoverrides) — live in `pnpm-workspace.yaml` under a top-level `overrides:` key (not in `package.json`).
- **Audit**: `pnpm audit` (exit code 1 if any severity); CI runs this with frozen lockfile.
- **Safe updates**: `pnpm update` updates within semver ranges; avoid `pnpm add x@latest` unless you intend a major upgrade.
