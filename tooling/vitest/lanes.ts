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
  /** Run the lane one project per Vitest process, in order, so one local Postgres serves one process at a time. */
  serial?: boolean;
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
   * `fast`, so a single local Postgres is never driven by two processes at once. Every worker runs
   * on its own database; e2e and integration run their files in parallel
   * (`tooling/vitest/worker-databases.ts`).
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
  },
];
