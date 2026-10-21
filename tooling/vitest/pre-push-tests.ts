#!/usr/bin/env tsx
/**
 * `pnpm test:pre-push [--base <ref>]` — the unit tests `.husky/pre-push` runs for the pushed
 * commits.
 *
 * The unit-project files `pnpm test:select` picks for the pushed changes, its always-run files
 * included. The selection's escalation list keeps the core domains whole — an auth, audit,
 * `src/shared/`, `src/core/` or `src/infrastructure/` change selects everything, and then the
 * whole unit project runs (`pnpm test:unit`); so does a selection that cannot be built. A
 * migration is narrowed here (`unitLevel`): it selects the unit tests that read migrations, since
 * only the database tests see it through the schema, and CI runs those. A changed test also selects
 * the policies that read every test's source, and those run first and alone ({@link prePushRuns}).
 * CI still runs every suite.
 *
 * Proven before it became the default (18 Oct 2026): eight planted breaks, one at a time, each
 * against the full unit project — every failing test was in the selection (0 misses), after the
 * container rule (docs/reference/testing/testing-conventions.md → Selected tests at push).
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedSince, resolveBase } from '@tooling/setup/common/git-environment.js';
import {
  selectTests,
  TEST_SOURCE_POLICIES,
  type TestSelection,
} from '@tooling/vitest/test-selection.util.js';

/** What pre-push runs: the whole unit project, nothing, or these unit-project files. */
export interface PrePushTests {
  run: 'all' | 'none' | 'selected';
  files: string[];
  reason: string;
}

/** What pre-push runs for a change; a selection that throws runs everything. */
export function prePushTests(options: { select: () => TestSelection }): PrePushTests {
  const all = (reason: string): PrePushTests => ({ run: 'all', files: [], reason });
  let selection: TestSelection;
  try {
    selection = options.select();
  } catch (error) {
    return all(`the selection failed, so everything runs: ${(error as Error).message}`);
  }
  if (selection.mode === 'all') return all(selection.reasons.join('; '));
  const files = selection.mode === 'selected' ? (selection.projects.unit ?? []) : [];
  if (files.length === 0) return { run: 'none', files, reason: 'no unit-project test selected' };
  return { run: 'selected', files, reason: `${files.length} unit-project file(s) selected` };
}

/**
 * The `pnpm` runs pre-push makes, in order. The test-source policies ({@link TEST_SOURCE_POLICIES})
 * go first and alone whenever they are in the run: they judge a changed test's source, so a new
 * test that would build a git repository by hand is stopped before it runs inside the hook. Then
 * the rest of the selection, or the whole unit project.
 */
export function prePushRuns(plan: PrePushTests): string[][] {
  const unit = (files: string[]) => ['exec', 'vitest', 'run', '--project', 'unit', ...files];
  if (plan.run === 'none') return [];
  if (plan.run === 'all') return [unit([...TEST_SOURCE_POLICIES]), ['test:unit']];
  const policies = plan.files.filter((file) => TEST_SOURCE_POLICIES.includes(file));
  const rest = plan.files.filter((file) => !policies.includes(file));
  if (policies.length === 0) return [unit(rest)];
  return rest.length === 0 ? [unit(policies)] : [unit(policies), unit(rest)];
}

function main(): void {
  const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
  const baseIndex = process.argv.indexOf('--base');
  const base = resolveBase({ base: baseIndex === -1 ? undefined : process.argv[baseIndex + 1] });
  const plan = prePushTests({
    select: () =>
      selectTests({ changedFiles: changedSince({ base }), repositoryRoot, unitLevel: true }),
  });
  console.log(`Pre-push unit tests: ${plan.run} — ${plan.reason}`);
  for (const args of prePushRuns(plan)) {
    const status = spawnSync('pnpm', args, { cwd: repositoryRoot, stdio: 'inherit' }).status ?? 1;
    if (status !== 0) {
      process.exitCode = status;
      return;
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
