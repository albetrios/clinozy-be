import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prePushTests } from '@tooling/vitest/pre-push-tests.js';
import type { TestSelection } from '@tooling/vitest/test-selection.util.js';
import { describe, expect, it } from 'vitest';

const PRE_PUSH = readFileSync(join(process.cwd(), '.husky', 'pre-push'), 'utf8');

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

  it('is what the hook runs, against the push base', () => {
    expect(PRE_PUSH).toContain('pnpm test:pre-push --base "$PUSH_BASE"');
    expect(PRE_PUSH).not.toMatch(/^\s*pnpm test:unit\b/m);
  });
});
