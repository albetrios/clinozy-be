import { type Lane, LANES } from '@tooling/vitest/lanes.js';
import { PARALLEL_DATABASE_PROJECT } from '@tooling/vitest/parallel-databases.js';
import { splitSerialProjectArgs } from '@tooling/vitest/run-parallel.js';
import { describe, expect, it } from 'vitest';

/** The project each Vitest invocation of a lane runs (coverage flags aside). */
const projectsOf = (lane: Lane) =>
  splitSerialProjectArgs(lane).map((args) => args[args.indexOf('--project') + 1]);

/**
 * Pins how `pnpm test` runs its database lane: one process at a time, with e2e + integration
 * folded into one `db-parallel` run in their place (proven equal to serial on 18 Oct 2026).
 */
describe('pnpm test database lane', () => {
  it('runs e2e and integration as one db-parallel process, between unit-db and security', () => {
    const lane = LANES.find((candidate) => candidate.name === 'db-bound');
    if (!lane) throw new Error('no db-bound lane');
    expect(projectsOf(lane)).toEqual([
      'unit-db',
      PARALLEL_DATABASE_PROJECT,
      'security',
      'performance',
    ]);
  });

  it('folds only the named projects, and leaves a lane without them one project at a time', () => {
    const lane: Lane = {
      name: 'example',
      args: ['run', '--project', 'a', '--project', 'b', '--project', 'c'],
      serial: true,
    };
    expect(projectsOf(lane)).toEqual(['a', 'b', 'c']);
    expect(projectsOf({ ...lane, parallelDatabaseProjects: ['b', 'c'] })).toEqual([
      'a',
      PARALLEL_DATABASE_PROJECT,
    ]);
  });
});
