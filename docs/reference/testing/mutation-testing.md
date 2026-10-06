# Mutation testing (Stryker)

Mutation testing checks whether unit tests detect small code changes (mutants) in production paths. This repo uses [Stryker](https://stryker-mutator.io/) with the Vitest runner.

---

## Commands

| Command | Purpose |
| ------- | ------- |
| `pnpm test:mutation` | Full Stryker run (enforces **≥ 70%** mutation score) |
| `vitest run --config tooling/vitest/stryker.config.ts` | Dry-run the same unit tests Stryker uses (no mutation) |

Configuration: [`stryker.config.json`](../../../stryker.config.json), [`tooling/vitest/stryker.config.ts`](../../../tooling/vitest/stryker.config.ts).

---

## Scope

**Mutated code** (see `mutate` in `stryker.config.json`):

- Auth, billing, and tenancy **services** that have co-located `*service*.unit.test.ts` coverage
- Security-critical **middleware**: auth, tenant, idempotency, API key auth, error handler, organization RLS transaction, encryption

**Not mutated** (not in `mutate`): other middleware (compress, helmet, CORS, health, etc.) — covered by
integration tests. The weekly full run takes about 18 minutes.

**Thresholds:** `break: 70`, `high: 80` (global mutation score).

**Mutator noise reduction:** `StringLiteral`, `Regex`, and `TemplateLiteral` mutations are excluded so scores reflect behavioral coverage.

---

## CI

Workflow: [.github/workflows/scheduled-stryker-mutation.yml](../../../.github/workflows/scheduled-stryker-mutation.yml)

- **Schedule:** Sundays 03:30 UTC
- **Manual:** `workflow_dispatch`
- **Services:** ephemeral Postgres + Redis — Stryker's dry run boots the mutated files' unit tests through the app stack (e.g. `i18n.middleware` locale cache), so the job provisions the same services + `test-env` action as the vitest lanes.
- **Artifacts:** `reports/mutation/mutation-report.html` and `mutation-report.json` (14-day retention)
- **Failure:** exit code 1 when mutation score &lt; 70%

---

## TypeScript 7 compatibility

Two settings in `stryker.config.json` exist solely to keep Stryker working on the native **TypeScript 7** compiler (`typescript@7.x`), whose programmatic API drops the legacy compiler functions Stryker relies on:

- **`tsconfigFile: "tsconfig.stryker-noop.json"`** (a path that intentionally does not exist). Stryker's `TsConfigPreprocessor` rewrites the tsconfig for its sandbox using `ts.parseConfigFileTextToJson`, which is `undefined` in TypeScript 7 → the run crashes before any mutant is tested. Pointing `tsconfigFile` at a non-existent file skips that preprocessor. It is safe because the Vitest runner resolves `@/` and `@tooling/` via the aliases in `tooling/vitest/stryker.config.ts`, not via tsconfig path rewriting — so mutation results are unaffected.
- **`ignorePatterns`** excludes paths that must not be copied into Stryker's sandbox and are irrelevant to mutation: the agent-tooling dirs `.claude` / `.cursor` / `.codex` / `.mcp.json` (committed **symlinks** into `agent-os/` → `ENOTSUP … copyfile`), the local `.codegraph` MCP database (a live SQLite dir whose WAL file rotates mid-copy → flaky `ENOENT`), and the `reports` / `coverage` output dirs. These are local-only concerns (absent in CI) but keep local runs deterministic.

Revisit both on each Stryker upgrade (the repo pins `^10.0.0`): drop them once a release supports TypeScript 7's compiler API, or if the repo moves back to a JS-based TypeScript.

Two more workarounds keep the run itself sound:

- **`@sentry/profiling-node` is aliased to `tooling/vitest/sentry-profiling-node.stub.ts`** in
  `tooling/vitest/stryker.config.ts`. Stryker's vitest runner forces the `threads` pool; tearing the
  threads down unloads Sentry's native CPU-profiler addon while a callback into it is still queued,
  and the run dies with SIGSEGV. No test exercises profiling, so a no-op integration is enough.
- **`patches/@stryker-mutator__vitest-runner@10.0.0.patch`** (registered under `patchedDependencies`
  in `pnpm-workspace.yaml`). Vitest 5 joins suite and test names with ` > `; the runner's test ids
  join them with spaces, so without the patch no test matched and every mutant "survived" having
  run none. Drop the patch once `@stryker-mutator/vitest-runner` ships the fix — the patch is keyed
  to 10.0.0, so pnpm refuses to install a newer runner until the entry is removed or re-keyed.

`stryker-config.policy.unit.test.ts` pins both.

---

## Local troubleshooting

1. Run `vitest run --config tooling/vitest/stryker.config.ts` — all tests must pass before Stryker starts.
2. Open `reports/mutation/mutation-report.html` after a run to inspect surviving mutants.
3. If Vitest reports “no related tests”, ensure the service has a `*service*.unit.test.ts` under `__tests__/unit/` and imports the service under test.

See also [testing-conventions.md](../testing/testing-conventions.md).
