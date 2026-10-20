---
name: be-code-quality-guard
description: Maintains the 3-layer code quality and security pipeline (editor Biome, Husky pre-commit hooks, CI security scanning). Use after changing Biome rules, pre-commit hooks, CI workflows, lint-staged config, or adding new security tooling.
trigger: biome.json, .biomeignore, .husky/pre-commit, .husky/pre-push, tooling/validate/gates.ts, tooling/validate/run-gate.ts, tooling/ci/run-named-step.sh, .gitleaks.toml, .semgrepignore
triggerNote: Lint/format/pre-commit/pre-push + branch-name policy
indexNote: 3-layer quality/security pipeline (editor Biome, husky pre-commit, CI scanning)
---

# Code quality guard (clinozy-be)

Maintains the layered code quality and security checking pipeline. Run this skill after any change to linting rules, pre-commit hooks, CI security steps, or related config files.

## Architecture: 3 layers

```text
Layer 1 (Editor)  -- Biome extension gives real-time lint + format while coding
Layer 2 (Pre-commit) -- Husky runs lint-staged (Biome), typecheck, Gitleaks, guards
Layer 3 (CI)      -- Full validation, Semgrep SAST, Gitleaks full-repo, tests
```

## Config files and their roles

| File                                | Layer | Purpose                                                                                                                                                                                                       |
| ----------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `biome.json`                        | 1 + 2 | Biome lint + format rules and per-path overrides                                                                                                                                                              |
| `.biomeignore`                      | 1 + 2 | Paths Biome skips (e.g. migrations, lockfile)                                                                                                                                                                 |
| `.vscode/settings.json`             | 1     | Editor format on save, Biome fix on save                                                                                                                                                                      |
| `.husky/pre-commit`                 | 2     | Pre-commit hook script (`pnpm guard:pre-commit` — static sync checks + gitleaks)                                                                                                                                                |
| `.husky/pre-push`                   | 2     | Pre-push: typecheck, build, build:check, changed-markdown lint, generated-doc drift checks (tree/routes/organization-scope), unit tests                                                                                |
| `.husky/commit-msg`                 | 2     | Validates commit messages with commitlint (conventional commits)                                                                                                                                              |
| `commitlint.config.cjs`             | 2 + 3 | Commitlint rules (extends `@commitlint/config-conventional`); same config as CI on push to `main`                                                                                                             |
| `lint-staged.config.mjs`            | 2     | Which files get linted/formatted on commit (at repo root)                                                                                                                                                     |
| `.gitleaks.toml`                    | 2 + 3 | gitleaks' built-in rules (`[extend] useDefault = true`) + the allowlist; `.gitleaksignore` holds old-commit fingerprints only                                                                                 |
| `.semgrepignore`                    | 3     | Semgrep ignored paths in CI                                                                                                                                                                                   |
| `.github/workflows/pr-ci.yml`       | 3     | CI jobs: `lint`, `typecheck`, `static-sync`, `unit`, `security-audit`, `security-secrets`, `security-sast`, `rls-security`, `build-verify`, `contract-plus-property`, `migration-lint` |
| `.github/workflows/pr-governance.yml` | 3   | Commitlint on every push to `main`                                                                                                                                                                            |

## When to run this skill

- Adding or changing Biome rules in `biome.json`
- Modifying `.husky/pre-commit` or `.husky/pre-push` hook steps (incl. the branch-name policy)
- Adding `.husky/commit-msg` or changing commitlint config
- Changing `lint-staged` config in `lint-staged.config.mjs`
- Adding or updating CI security jobs
- Adding new code quality tooling

## Layer 1: Editor (real-time while coding)

### Biome (`@biomejs/biome` devDependency)

| Area        | Examples in `biome.json`                                                                 |
| ----------- | ---------------------------------------------------------------------------------------- |
| Correctness | `noUnusedVariables`, `noExplicitAny`                                                     |
| Style       | `useConst`, `useImportType`, `noParameterAssign`                                       |
| Complexity  | `noExcessiveCognitiveComplexity`, `noExcessiveLinesPerFunction`                        |
| Security    | `noGlobalEval`, `noImpliedEval` (nursery)                                                |

Architectural import restrictions previously in ESLint (`no-restricted-imports`, `no-restricted-syntax`) are enforced by global tests (e.g. `external-sdk-coverage.global.test.ts`, worker RLS security tests) and code review.

### VS Code settings (`.vscode/settings.json`)

Must include:

```json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.codeActionsOnSave": { "source.fixAll.biome": "explicit" }
}
```

Extension: `biomejs.biome` (see `.vscode/extensions.json`).

## Layer 2: Pre-commit (`.husky/pre-commit` → `pnpm guard:pre-commit`)

The hook runs **`pnpm guard:pre-commit`** — labeled checks: the steps that write run one at a time, then the read-only checks in parallel (`--serial` runs all one at a time). If any fail, the commit is rejected. See **be-before-commit-guard** when the user reports a failed commit. List steps: **`pnpm guard:pre-commit:list`**.

Pre-commit mirrors a **subset** of the static checks in [`.github/workflows/pr-ci.yml`](../../../.github/workflows/pr-ci.yml). CI additionally runs `deps:audit`, full-repo `pnpm validate`, `validate:domain:coverage`, always-on `db:migrate:lint`, `test:contract`, Semgrep, and full-repo Gitleaks.

| Step | Command | What it catches |
| ---- | ------- | --------------- |
| 1 | `pnpm lint-staged` | Biome + markdownlint on staged files |
| 2 | `pnpm typecheck` | TypeScript type errors |
| 3 | `pnpm validate:domain:strict` | Domain structure (warnings fail) |
| 3b | `pnpm test:global` | Architecture policy tests (conditional: only when `src/domains/**/*.ts` staged) |
| 4 | `pnpm validate:scripts-layout` | Scripts layout + MCP optional dep |
| 5–6 | `pnpm routes:catalog` + `:check` | Route catalog drift |
| 6b–6c | `tool:project-structure-tree` (+ `:check` when wired) | Src layout tree drift when `src/**` or `tooling/**` staged |
| 7 | `pnpm docs:check` (conditional) | OpenAPI / Postman drift |
| 8 | `pnpm tsdoc:check` | TSDoc coverage budget |
| 9 | `pnpm validate:test-naming` (when wired) | Test filename suffixes |
| 10–10b | `db:migrate:lint` + DBML regen (conditional) | Migration safety |
| 11 | `pnpm tool:generate-project-identity:check` | Manifest / workflow drift |
| 12 | `pnpm tool:sync-env-example` | `.env.example` drift |
| 13 | `gitleaks protect --staged` | Secrets in staged files (**required** locally) |
| 14–15 | Conflict markers + large files | Accidental merges / >3MB staged files (iterations/ exempt) |

### Pre-push (`.husky/pre-push`)

| Step | Command | What it catches |
| ---- | ------- | --------------- |
| 1 | branch-name policy | Branch names outside the allowed prefixes (`main`/`claude/*` + `<type>/…`) — fail-fast; bypass once: `SKIP_BRANCH_CHECK=1 git push` (see `agent-os/rules/be-git-branch-naming.mdc`) |
| 2–4 | `pnpm typecheck`, `pnpm build`, `pnpm build:check` | Type errors, compile failures, unresolved `@/` aliases in `dist/` |
| 5 | `pnpm docs:lint:changed --base <push base>` | Markdown lint — when Markdown is pushed |
| 6–8 | `pnpm tool:project-structure-tree:check`, `routes:catalog:check`, `validate:route-organization-scope` | Generated-doc drift — when `src/`, `tooling/` or a generated doc is pushed |
| 9 | `pnpm security:semgrep:push --base <push base>` | Semgrep on pushed auth / tenancy / billing / database-context code (a finding blocks; no semgrep → a warning) |
| 10 | `pnpm test:pre-push --base <push base>` | The unit tests `pnpm test:select` picks — when unit-relevant files are pushed |
| 11 | `pnpm sonar:scan` | SonarQube quality gate — when deployed-surface `src/**/*.ts` is pushed; any unresolved issue blocks. **Mandatory — no bypass.** |

One list, `tooling/validate/pre-push-steps.ts`: `.husky/pre-push` is `pnpm guard:pre-push`
(`tooling/validate/run-pre-push.ts`), and `pnpm test:affected` previews the same steps with why
each runs. Every step measures the push from one base (`resolveBase`: the upstream, else
`origin/<trunk>`).

> The SonarQube quality gate runs at **pre-push** (`pnpm guard:pre-push`, the last step), as in clinozy-fe. It is mandatory and has no bypass.

### Commit message hook (`.husky/commit-msg`)

| Step | Command                            | What it catches                                                                                              |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1    | `pnpm exec commitlint --edit "$1"` | Non–conventional-commit messages (same rules as push workflow `.github/workflows/pr-governance.yml` on `main`) |

### lint-staged config (`lint-staged.config.mjs`)

```javascript
// lint-staged.config.mjs (at repo root)
export default {
  '*.{ts,tsx}': ['biome check --write --no-errors-on-unmatched'],
  '*.{json,md}': ['biome format --write --no-errors-on-unmatched'],
  '*.md': ['markdownlint-cli2 --fix'],
  // project-identity.constants.ts excluded from Biome (codegen output)
  // CHANGELOG.md and PR templates excluded from markdownlint
};
```

## Layer 3: CI (`.github/workflows/pr-ci.yml`)

### `lint` / `typecheck` / `static-sync` / `security-*` jobs — validate + static security

- **Dependency audit**: `pnpm audit` runs after install; the pipeline **fails on any vulnerability** (no audit-level filter). Keep dependencies and `pnpm.overrides` so that `pnpm audit` passes. See **be-dependency-security** skill when changing `package.json` or `pnpm-lock.yaml`.
- **Migration safety lint**: `pnpm db:migrate:lint` scans `migrations/*.sql` for zero-downtime-unsafe patterns (same command as pre-commit when SQL migrations are staged).
- **Gitleaks + Semgrep** run in the same job after validate steps (one checkout; no duplicate `security-tests` Vitest job — security tests are in `test:coverage`).

| Step | Tool                          | What it catches                                         |
| ---- | ----------------------------- | ------------------------------------------------------- |
| 1    | `gitleaks` CLI (binary, v8)   | Full-repo secret scan (AWS keys, tokens, passwords)     |
| 2    | `semgrep scan --config p/default --error --baseline-commit <PR base>` | SAST: SQL injection, XSS, insecure crypto, OWASP Top 10 — fails on findings the PR introduces |

Both versions come from `tooling/setup/agent/tool-versions.sh` (the job appends it to
`$GITHUB_ENV`): gitleaks via `install-gitleaks.sh` (SHA-256-verified), semgrep as
`pip install "semgrep==${SEMGREP_VERSION}"` — the same pins cloud sessions install. A bump is a
one-line PR there (owner: **be-dependency-security**); never a version in the workflow.

### `unit` job (runs after static checks pass)

- Postgres + Redis service containers → `pnpm db:migrate` → `pnpm test:coverage` (includes security, performance, e2e, integration, unit).

### `contract-plus-property` job

- Postgres + Redis service containers → `pnpm db:migrate` → `pnpm db:seed:full` → background `pnpm tsx src/server.ts` → wait for `/readyz` → `pnpm test:api-smoke`. Catches route/DI wiring regressions against real HTTP.

### Supporting ignore files

- `.gitleaks.toml` -- gitleaks' built-in rules (`[extend] useDefault = true`; without it no rule loads and every scan passes) plus the paths it skips (node_modules, .env.example, lock files, generated docs). The PR CI secrets job plants a key and fails if the config misses it
- A fixture that looks like a secret: mark its line `// gitleaks:allow` (on the first line of a multi-line match). `.gitleaksignore` lists only fingerprints of old commits; never add a new finding there
- `.semgrepignore` -- paths Semgrep skips (node_modules, dist, migrations, lock files, design drops' `iterations/*/intake-files/`)

## Convenience scripts (`package.json`)

| Script                  | What it does                                             |
| ----------------------- | -------------------------------------------------------- |
| `pnpm security:secrets` | Manual full-repo Gitleaks scan (requires `gitleaks` CLI) |
| `pnpm security:sast`    | Manual Semgrep scan (requires `semgrep` CLI)             |
| `pnpm validate`         | biome check + typecheck (same as CI)                     |
| `pnpm lint`             | `biome check src tooling`                                |
| `pnpm format`           | `biome format --write src tooling`                       |

## Checklist (run after changes)

1. **Biome config valid?** -- run `pnpm lint` and confirm no config errors
2. **Pre-commit hook executable?** -- `.husky/pre-commit` must have execute permission
3. **lint-staged patterns correct?** -- ensure patterns match actual file locations
4. **CI workflow valid YAML?** -- check `.github/workflows/pr-ci.yml` syntax
5. **Ignore files up to date?** -- `.gitleaks.toml` and `.semgrepignore` include new generated/vendor paths
6. **VS Code settings preserved?** -- Biome default formatter + `source.fixAll.biome` on save
7. **Dependencies installed?** -- `@biomejs/biome` in devDependencies; no `eslint` / `prettier` packages

## Adding new Biome rules

1. Edit `biome.json` (use `overrides` for tests, scripts, tooling paths)
2. Run `pnpm lint` to verify no false positives on existing code
3. Update this skill's Layer 1 tables above

When adding a new pre-commit check:

1. Add the check to `src/scripts/tooling/run-pre-commit-guard.ts`: `buildRunnableSteps`, the one list — its `description` is what `--list` prints, `applies` whether the staged files need it — `phase: 'write'` when it changes the working tree, the index or `node_modules`, a `lock` when it shares files with another check
2. Update this skill's Layer 2 table above
3. Test with a manual commit
