import { type Lane, LANES } from '@tooling/vitest/lanes.js';
import { PARALLEL_DATABASE_PROJECT } from '@tooling/vitest/parallel-databases.js';
import { splitSerialProjectArgs } from '@tooling/vitest/run-parallel.js';
import { describe, expect, it } from 'vitest';

/** The project each Vitest invocation of a lane runs (coverage flags aside). */
const projectsOf = (lane: Lane, coverage = false) =>
  splitSerialProjectArgs(lane, coverage).map((args) => args[args.indexOf('--project') + 1]);

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

  it('keeps e2e and integration one by one under coverage, each with its own report', () => {
    const lane = LANES.find((candidate) => candidate.name === 'db-bound');
    if (!lane) throw new Error('no db-bound lane');
    expect(projectsOf(lane, true)).toEqual([
      'unit-db',
      'e2e',
      'integration',
      'security',
      'performance',
    ]);
    const reports = splitSerialProjectArgs(lane, true).map((args) =>
      args.find((arg) => arg.startsWith('--coverage.reportsDirectory=')),
    );
    expect(reports).toContain('--coverage.reportsDirectory=coverage-db-bound-e2e');
    expect(reports).toContain('--coverage.reportsDirectory=coverage-db-bound-integration');
  });
});
