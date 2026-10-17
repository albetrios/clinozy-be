import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pushSteps, selectionTable, UNIT_RELEVANT } from '@tooling/vitest/affected.js';

const PRE_PUSH = readFileSync(join(process.cwd(), '.husky', 'pre-push'), 'utf8');

/**
 * Pins `pnpm test:affected` (`/be-validate --affected`) to `.husky/pre-push`: the same pnpm
 * steps, the same unit-relevant pattern — so the preview never describes a push that no longer
 * runs that way.
 */
describe('test:affected mirrors .husky/pre-push', () => {
  it('lists exactly the pnpm steps the hook runs', () => {
    const hookSteps = [...PRE_PUSH.matchAll(/^\s*(pnpm [a-z][\w:.-]*)/gm)].map((match) => match[1]);
    const previewSteps = pushSteps([])
      .map((step) => step.command)
      .filter((command) => command.startsWith('pnpm '));
    expect(previewSteps).toEqual(hookSteps);
  });

  it('uses the hook’s unit-relevant pattern', () => {
    expect(PRE_PUSH).toContain(`'${UNIT_RELEVANT.source.replaceAll('\\/', '/')}'`);
  });

  it('says why each step runs, and summarizes the always-run tests', () => {
    const steps = pushSteps(['src/domains/auth/auth.service.ts', 'docs/x.md']);
    expect(steps.filter((step) => step.runs).map((step) => step.command)).toContain(
      'pnpm security:semgrep:push',
    );
    expect(steps.find((step) => step.command === 'pnpm docs:lint:changed')?.why).toBe(
      'pushed Markdown',
    );
    const table = selectionTable({
      mode: 'selected',
      reasons: ['2 of 9'],
      projects: { unit: ['src/a.unit.test.ts', 'src/b.unit.test.ts'] },
      why: { 'src/a.unit.test.ts': ['next to src/a.ts'], 'src/b.unit.test.ts': ['always run'] },
    });
    expect(table).toContain('| unit | `src/a.unit.test.ts` | next to src/a.ts |');
    expect(table).toContain('| unit | 1 file(s) | always run (any source change) |');
  });
});
