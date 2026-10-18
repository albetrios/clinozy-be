/**
 * The switch and worker count of the parallel database experiment (`pnpm test:parallel-db`),
 * shared by the Vitest config (`tooling/vitest/projects.ts`, which loads before path aliases
 * resolve) and the harness (`src/tests/helpers/local-test-database.ts`).
 */

/**
 * Whether this run is the parallel database experiment: `TEST_PARALLEL_DATABASES=true`.
 *
 * @remarks
 * Every Vitest worker then gets its own clone of the migrated test database and its own Redis
 * namespace. Serial stays the default until the experiment's nightly lane has 10 green runs
 * (`docs/reference/testing/testing-conventions.md` › Parallel database tests).
 */
export function isParallelDatabaseRun(): boolean {
  return process.env.TEST_PARALLEL_DATABASES === 'true';
}

/**
 * How many workers the experiment runs: `TEST_PARALLEL_WORKERS`, 1 to 16, default 4.
 *
 * @remarks
 * The `db-parallel` project's `maxWorkers` and the number of database clones the global setup
 * makes both come from here, so a worker never lacks its clone. An out-of-range or non-integer
 * value falls back to the default.
 */
export function parallelDatabaseWorkers(): number {
  const workers = Number(process.env.TEST_PARALLEL_WORKERS ?? '4');
  return Number.isInteger(workers) && workers >= 1 && workers <= 16 ? workers : 4;
}
