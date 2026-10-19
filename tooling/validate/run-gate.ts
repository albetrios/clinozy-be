#!/usr/bin/env tsx
/**
 * Runs one gate from the one list (`tooling/validate/gates.ts`):
 *
 *   pnpm ci:quality     # tsx tooling/validate/run-gate.ts quality — stops at the first red
 *   pnpm ci:local       # tsx tooling/validate/run-gate.ts local   — stops at the first red
 *   pnpm health         # tsx tooling/validate/run-gate.ts health  — runs every step, then a table
 *   pnpm health:fix     # the same, after `lint:fix` + `format` repair the fixable surface
 */
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { type GateName, type GateStep, stepsFor } from '@tooling/validate/gates.js';

/** One step's outcome. */
export type StepResult = { label: string; passed: boolean; seconds: number };

const GATES: readonly GateName[] = ['quality', 'local', 'health'];

/** Runs one step with its output streamed, and times it. */
function runStep(step: GateStep): StepResult {
  process.stdout.write(`▶ ${step.label}\n`);
  const startedAt = performance.now();
  const [command, ...args] = step.command;
  const result = spawnSync(command ?? 'pnpm', args, { stdio: 'inherit' });
  const seconds = (performance.now() - startedAt) / 1000;
  return { label: step.label, passed: result.status === 0, seconds };
}

/**
 * The end-of-run table: one `PASS`/`FAIL` row per step that ran, then the verdict.
 *
 * @remarks
 * Exported so the format is pinned by a test rather than by eyeballing a run.
 */
export function formatGateSummary(options: { gate: GateName; results: readonly StepResult[] }) {
  const failed = options.results.filter((result) => !result.passed).length;
  const rows = options.results.map(
    (result) =>
      `${result.passed ? 'PASS' : 'FAIL'}  ${result.label} (${result.seconds.toFixed(1)}s)`,
  );
  const verdict =
    failed === 0 ? `✓ ${options.gate}: all steps passed.` : `✗ ${options.gate}: ${failed} failed.`;
  return `\n${options.gate} summary\n${rows.join('\n')}\n${verdict}\n`;
}

/**
 * Runs `gate`: `quality` and `local` stop at the first failing step, `health` runs them all.
 *
 * @remarks
 * Returns the exit code: 0 when every step that ran passed, else 1.
 */
export function runGate(options: { gate: GateName; fix: boolean }): number {
  if (options.fix) {
    process.stdout.write('── auto-fix pass (lint + format) ──\n');
    spawnSync('pnpm', ['lint:fix'], { stdio: 'inherit' });
    spawnSync('pnpm', ['format'], { stdio: 'inherit' });
  }
  const results: StepResult[] = [];
  for (const step of stepsFor(options.gate)) {
    const result = runStep(step);
    results.push(result);
    if (!result.passed && options.gate !== 'health') break;
  }
  process.stdout.write(formatGateSummary({ gate: options.gate, results }));
  return results.every((result) => result.passed) ? 0 : 1;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [gate, ...flags] = process.argv.slice(2);
  const known = GATES.find((candidate) => candidate === gate);
  const unknownFlag = flags.find((flag) => flag !== '--fix');
  if (!known || unknownFlag || (flags.includes('--fix') && known !== 'health')) {
    process.stderr.write(
      `usage: run-gate.ts <${GATES.join(' | ')}> (--fix with health only); got: ${process.argv.slice(2).join(' ')}\n`,
    );
    process.exit(2);
  }
  process.exit(runGate({ gate: known, fix: flags.includes('--fix') }));
}
