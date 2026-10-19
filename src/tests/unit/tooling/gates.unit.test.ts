import { readFileSync } from 'node:fs';
import { GATE_STEPS, stepsFor } from '@tooling/validate/gates.js';
import { formatGateSteps, formatGateSummary } from '@tooling/validate/run-gate.js';
import { describe, expect, it } from 'vitest';

const scripts = (
  JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }
).scripts;
const labels = (gate: Parameters<typeof stepsFor>[0]) => stepsFor(gate).map((step) => step.label);

/**
 * Locks in the one gate list (`tooling/validate/gates.ts`): `ci:quality`, `ci:local` and
 * `pnpm health` read it, so no gate can lose a step the others run.
 */
describe('the one gate list', () => {
  it('backs ci:quality, ci:local and health, and nothing chains steps by hand', () => {
    expect(scripts['ci:quality']).toBe('tsx tooling/validate/run-gate.ts quality');
    expect(scripts['ci:local']).toBe('tsx tooling/validate/run-gate.ts local');
    expect(scripts.health).toBe('tsx tooling/validate/run-gate.ts health');
    expect(scripts['health:fix']).toBe('tsx tooling/validate/run-gate.ts health --fix');
  });

  it('makes ci:local every ci:quality step (property tests run inside the full suite) plus build and tests', () => {
    const local = labels('local');
    for (const label of labels('quality').filter((step) => step !== 'Property tests')) {
      expect(local).toContain(label);
    }
    expect(local.slice(-4)).toEqual([
      'Build',
      'Build alias check',
      'Full test suite',
      'Route success coverage',
    ]);
  });

  it('makes health ci:local with the database-free fast tests in place of the full suite', () => {
    const local = labels('local').filter(
      (label) => label !== 'Full test suite' && label !== 'Route success coverage',
    );
    expect(labels('health')).toEqual([...local, 'Fast tests (unit, property, global)']);
  });

  it('runs only scripts that exist', () => {
    for (const step of GATE_STEPS) {
      const [command, script] = step.command;
      if (command === 'pnpm') expect(scripts[script ?? ''], script).toBeDefined();
    }
  });

  it('runs the sub-domain unit matrix in ci:local, and lists every step numbered', () => {
    expect(labels('local')).toContain('Domain unit matrix');
    const listed = formatGateSteps('local').split('\n');
    expect(listed).toHaveLength(stepsFor('local').length);
    expect(listed[0]).toBe('1. Dependency audit (production tree) — pnpm deps:audit:prod');
  });

  it('prints one row per step and the verdict', () => {
    const summary = formatGateSummary({
      gate: 'health',
      results: [
        { label: 'Lint', passed: true, seconds: 1.234 },
        { label: 'Build', passed: false, seconds: 10 },
      ],
    });
    expect(summary).toContain('PASS  Lint (1.2s)');
    expect(summary).toContain('FAIL  Build (10.0s)');
    expect(summary).toContain('✗ health: 1 failed.');
  });
});
