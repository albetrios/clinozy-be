/**
 * Lane definitions for the parallel test driver (`run-parallel.ts`).
 *
 * Split out of the driver so tests can read the lanes without importing that
 * module — `run-parallel.ts` invokes `main()` at import time, so importing it
 * from a test would spawn the whole test matrix recursively.
 */

/** One vitest invocation: a named set of CLI args, optionally run project-by-project. */
type Lane = {
  name: string;
  args: string[];
  /** Lanes that run sequentially together — useful when DB cleanup races would happen across forks. */
  serial?: boolean;
  /**
   * Projects of a serial lane that `pnpm test` runs as one `db-parallel` process instead, where
   * they come in the lane: files in parallel, each worker on its own database clone. Proven equal
   * to serial, test by test, on 18 Oct 2026 (docs/reference/testing/testing-conventions.md ›
   * Parallel database tests). `pnpm test:select --run` and CI still run them one by one.
   */
  parallelDatabaseProjects?: string[];
};

export type { Lane };

export const LANES: Lane[] = [
  /**
   * Parallel-safe: pure-unit, property, global — files run concurrently inside Vitest.
   * No shared Postgres cleanup.
   */
  {
    name: 'fast',
    args: ['run', '--project', 'unit', '--project', 'property', '--project', 'global'],
  },
  /**
   * DB-bound: unit-db, e2e, integration, security, performance — one process at a time, after
   * `fast`, so a single local Postgres is never driven by two processes at once. Each project runs
   * its files serially, except e2e + integration, which run together in parallel (`db-parallel`).
   */
  {
    name: 'db-bound',
    args: [
      'run',
      '--project',
      'unit-db',
      '--project',
      'e2e',
      '--project',
      'integration',
      '--project',
      'security',
      '--project',
      'performance',
    ],
    serial: true,
    parallelDatabaseProjects: ['e2e', 'integration'],
  },
];
