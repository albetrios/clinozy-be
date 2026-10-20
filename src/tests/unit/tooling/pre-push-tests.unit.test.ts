import { describe, expect, it } from 'vitest';
import { prePushSteps } from '@tooling/validate/pre-push-steps.js';
import { prePushRuns, prePushTests } from '@tooling/vitest/pre-push-tests.js';
import { TEST_SOURCE_POLICIES, type TestSelection } from '@tooling/vitest/test-selection.util.js';

const selected = (projects: Record<string, string[]>): TestSelection => ({
  mode: 'selected',
  reasons: ['3 of 716'],
  projects,
  why: {},
});

/**
 * Pins what `.husky/pre-push` runs for its unit tests (task 7): the selected unit-project files,
 * and still everything when the selection escalates (a core-domain change) or fails.
 */
describe('pre-push unit tests', () => {
  it('runs only the selected unit-project files', () => {
    const plan = prePushTests({
      select: () =>
        selected({
          unit: ['src/a.unit.test.ts', 'src/b.unit.test.ts'],
          'unit-db': ['src/c.test.ts'],
        }),
    });
    expect(plan).toEqual({
      run: 'selected',
      files: ['src/a.unit.test.ts', 'src/b.unit.test.ts'],
      reason: '2 unit-project file(s) selected',
    });
  });

  it('runs everything for a core-domain change, and when the selection fails', () => {
    const core = prePushTests({
      select: () => ({
        mode: 'all',
        reasons: ['src/domains/tenancy/tenancy.container.ts escalates'],
        projects: {},
        why: {},
      }),
    });
    expect(core).toMatchObject({
      run: 'all',
      reason: 'src/domains/tenancy/tenancy.container.ts escalates',
    });
    const failed = prePushTests({
      select: () => {
        throw new Error('no merge base');
      },
    });
    expect(failed).toMatchObject({ run: 'all' });
    expect(failed.reason).toContain('no merge base');
  });

  it('runs nothing when no unit-project test is selected', () => {
    expect(prePushTests({ select: () => selected({ 'unit-db': ['x.test.ts'] }) }).run).toBe('none');
    expect(
      prePushTests({
        select: () => ({ mode: 'none', reasons: [], projects: {}, why: {} }),
      }).run,
    ).toBe('none');
  });

  it('runs the test-source policies first and alone, so a bad new test never runs in the hook', () => {
    const unit = (files: string[]) => ['exec', 'vitest', 'run', '--project', 'unit', ...files];
    const policies = [...TEST_SOURCE_POLICIES];
    expect(
      prePushRuns({ run: 'selected', files: ['src/new.unit.test.ts', ...policies], reason: '' }),
    ).toEqual([unit(policies), unit(['src/new.unit.test.ts'])]);
    expect(prePushRuns({ run: 'selected', files: ['src/a.unit.test.ts'], reason: '' })).toEqual([
      unit(['src/a.unit.test.ts']),
    ]);
    expect(prePushRuns({ run: 'all', files: [], reason: '' })).toEqual([
      unit(policies),
      ['test:unit'],
    ]);
    expect(prePushRuns({ run: 'none', files: [], reason: '' })).toEqual([]);
  });

  it('is what the hook runs, against the push base', () => {
    const steps = prePushSteps({ changedFiles: ['src/a.ts'], base: 'origin/main' });
    expect(steps.find((step) => step.label === 'pnpm test:pre-push')?.pnpmArguments).toEqual([
      'test:pre-push',
      '--base',
      'origin/main',
    ]);
    expect(steps.some((step) => step.label === 'pnpm test:unit')).toBe(false);
  });
});
