import { describe, expect, it } from 'vitest';
import type { TestSelection } from '@tooling/vitest/test-selection.util.js';
import {
  failedTestFiles,
  findSelectorMisses,
  fixtureFor,
} from '@tooling/vitest/selector-misses.js';

const selected: TestSelection = {
  mode: 'selected',
  reasons: [],
  projects: { unit: ['src/a.unit.test.ts'], integration: ['src/b.integration.test.ts'] },
  why: {},
};

/**
 * Locks in the selector miss check: a failed test file the selection did not hold is a miss (and
 * prints a fixture line); a selection that runs everything misses nothing.
 */
describe('selector misses', () => {
  it('reads the failed files of a Vitest JSON report, repository-relative', () => {
    expect(
      failedTestFiles({
        repositoryRoot: '/work/repository',
        report: {
          testResults: [
            { name: '/work/repository/src/a.unit.test.ts', status: 'failed' },
            { name: '/work/repository/src/c.unit.test.ts', status: 'passed' },
            { name: 'src/d.e2e.test.ts', status: 'failed' },
          ],
        },
      }),
    ).toEqual(['src/a.unit.test.ts', 'src/d.e2e.test.ts']);
  });

  it('flags only the failed files the selection would have skipped', () => {
    const failed = ['src/a.unit.test.ts', 'src/d.e2e.test.ts', 'src/d.e2e.test.ts'];
    expect(findSelectorMisses({ failed, selection: selected })).toEqual(['src/d.e2e.test.ts']);
    expect(findSelectorMisses({ failed, selection: { ...selected, mode: 'all' } })).toEqual([]);
  });

  it('prints a fixture line from the changed source files', () => {
    expect(
      JSON.parse(
        fixtureFor({ changedFiles: ['src/x.ts', 'docs/y.md'], test: 'src/d.e2e.test.ts' }),
      ),
    ).toEqual({
      name: 'miss: src/d.e2e.test.ts',
      changed: ['src/x.ts'],
      mustSelect: ['src/d.e2e.test.ts'],
    });
  });
});
