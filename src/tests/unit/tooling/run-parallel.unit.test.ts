import { type Lane, LANES } from '@tooling/vitest/lanes.js';
import { splitSerialProjectArgs } from '@tooling/vitest/run-parallel.js';
import { describe, expect, it } from 'vitest';

/** The project each Vitest invocation of a lane runs (coverage flags aside). */
const projectsOf = (lane: Lane, coverage = false) =>
  splitSerialProjectArgs(lane, coverage).map((args) => args[args.indexOf('--project') + 1]);

/**
 * Pins how `pnpm test` runs its database lane: one project per process, in order — with and
 * without coverage — each worker on its own database (`tooling/vitest/worker-databases.ts`).
 */
describe('pnpm test database lane', () => {
  it('runs each database project in its own process, in the lane order', () => {
    const lane = LANES.find((candidate) => candidate.name === 'db-bound');
    if (!lane) throw new Error('no db-bound lane');
    const projects = ['unit-db', 'e2e', 'integration', 'security', 'performance'];
    expect(projectsOf(lane)).toEqual(projects);
    expect(projectsOf(lane, true)).toEqual(projects);
  });

  it('runs a lane that is not serial as one invocation', () => {
    const lane: Lane = { name: 'example', args: ['run', '--project', 'a', '--project', 'b'] };
    expect(splitSerialProjectArgs(lane, false)).toEqual([lane.args]);
  });

  it('gives every project its own coverage report under coverage', () => {
    const lane = LANES.find((candidate) => candidate.name === 'db-bound');
    if (!lane) throw new Error('no db-bound lane');
    const reports = splitSerialProjectArgs(lane, true).map((args) =>
      args.find((arg) => arg.startsWith('--coverage.reportsDirectory=')),
    );
    expect(reports).toContain('--coverage.reportsDirectory=coverage-db-bound-e2e');
    expect(reports).toContain('--coverage.reportsDirectory=coverage-db-bound-integration');
  });
});
