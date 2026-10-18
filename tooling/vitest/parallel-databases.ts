/**
 * The parallel database run (`pnpm test`'s e2e + integration step, and `pnpm test:parallel-db`):
 * its project, its switch and its worker count, shared by the Vitest config
 * (`tooling/vitest/projects.ts`, which loads before path aliases resolve), the `pnpm test` driver
 * (`tooling/vitest/run-parallel.ts`) and the harness (`src/tests/helpers/local-test-database.ts`).
 */
import { availableParallelism } from 'node:os';

/** The Vitest project that runs the e2e and integration suites with files in parallel. */
export const PARALLEL_DATABASE_PROJECT = 'db-parallel';

/**
 * The environment variable that turns a run into a parallel database run. Set by the launchers
 * (`pnpm test`, `pnpm test:parallel-db`), never by hand.
 */
export const PARALLEL_DATABASES_SWITCH = 'TEST_PARALLEL_DATABASES';

/**
 * Whether this run is a parallel database run: {@link PARALLEL_DATABASES_SWITCH} is `true`.
 *
 * @remarks
 * Every Vitest worker then gets its own clone of the migrated test database and its own Redis
 * namespace. Proven equal to serial on 18 Oct 2026: three parallel runs and one serial run of the
 * e2e + integration suites gave the same 1,671 test ids with the same status
 * (`docs/reference/testing/testing-conventions.md` › Parallel database tests).
 */
export function isParallelDatabaseRun(): boolean {
  return process.env[PARALLEL_DATABASES_SWITCH] === 'true';
}

/**
 * How many workers a parallel database run uses: the machine's cores, at most 4.
 *
 * @remarks
 * The `db-parallel` project's `maxWorkers` and the number of database clones the global setup
 * makes both come from here, so a worker never lacks its clone. Four is the count the proof ran.
 */
export function parallelDatabaseWorkers(): number {
  return Math.min(4, availableParallelism());
}
