/**
 * Every Vitest worker that reaches Postgres runs on its own database: a clone of the migrated test
 * database, `<test database>_worker_<pool id>`. Shared by the Vitest config
 * (`tooling/vitest/projects.ts`, which loads before path aliases resolve), the global setups
 * (`src/tests/global-setup.ts`, `src/tests/chaos/global-setup.ts`) and the harness
 * (`src/tests/helpers/local-test-database.ts`).
 */
import { availableParallelism } from 'node:os';

/**
 * One worker's database: `<database>_worker_<pool id>`.
 *
 * @remarks
 * The pool id is a value (Vitest's `VITEST_POOL_ID`, 1 to the pool size), not a name we own.
 */
export function workerDatabaseName(options: { database: string; worker: string }): string {
  return `${options.database}_worker_${options.worker}`;
}

/** The most e2e or integration files that run at once: the four the 18 Oct 2026 proof ran. */
const MOST_PARALLEL_DATABASE_FILES = 4;

/**
 * Whether this Vitest invocation collects coverage: `--coverage` (or `--coverage.enabled`) on its
 * command line, as `pnpm test:coverage` and the CI database shards pass it.
 */
export function isCoverageRun(argv: readonly string[] = process.argv): boolean {
  return argv.some(
    (argument) =>
      argument === '--coverage' ||
      argument === '--coverage.enabled' ||
      argument === '--coverage.enabled=true',
  );
}

/**
 * How the e2e and integration projects run their files: in parallel, at most
 * {@link MOST_PARALLEL_DATABASE_FILES} at once (fewer on a smaller machine), each worker on its own
 * database — or one at a time under coverage.
 *
 * @remarks
 * One at a time under coverage because, with V8 coverage on, four parallel workers on a 4-core
 * machine pushed an API query past its 5 s statement timeout (18 Oct 2026), while plain parallel
 * runs stayed green. Parallel was proven equal to one at a time on 18 Oct 2026: three parallel runs
 * and one serial run of the e2e + integration suites gave the same 1,671 test ids with the same
 * status (`docs/reference/testing/testing-conventions.md` › Worker databases).
 */
export function databaseProjectParallelism(argv: readonly string[] = process.argv): {
  fileParallelism: boolean;
  maxWorkers: number;
} {
  if (isCoverageRun(argv)) return { fileParallelism: false, maxWorkers: 1 };
  return {
    fileParallelism: true,
    maxWorkers: Math.min(MOST_PARALLEL_DATABASE_FILES, availableParallelism()),
  };
}

/**
 * How many worker databases a run needs: one per Vitest pool slot.
 *
 * @remarks
 * A worker's pool id (`VITEST_POOL_ID`) never exceeds the pool's size, which is the run's
 * `--maxWorkers` when one is given and otherwise at most the machine's cores (measured on Vitest
 * 5.0.3, 19 Oct 2026). The largest of the cores, the run's `maxWorkers` and every selected
 * project's `maxWorkers` therefore covers every pool id. A `maxWorkers` given as a percentage
 * never exceeds the cores, so only numbers count.
 */
export function workerDatabaseCount(run: {
  maxWorkers?: number | string;
  projectMaxWorkers: readonly (number | string | undefined)[];
}): number {
  const counts = [run.maxWorkers, ...run.projectMaxWorkers].filter(
    (count): count is number => typeof count === 'number',
  );
  return Math.max(availableParallelism(), ...counts);
}
