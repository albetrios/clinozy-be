#!/usr/bin/env tsx
/**
 * Runs one gate from the one list (`tooling/validate/gates.ts`):
 *
 *   pnpm ci:quality     # tsx tooling/validate/run-gate.ts quality — stops at the first red
 *   pnpm ci:local       # tsx tooling/validate/run-gate.ts local   — stops at the first red
 *   pnpm health         # tsx tooling/validate/run-gate.ts health  — runs every step, then a table
 *   pnpm health:fix     # the same, after `lint:fix` + `format` repair the fixable surface
 *   tsx tooling/validate/run-gate.ts <gate> --list   # the gate's steps, numbered, without running them
 */
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { isMain, parseCommandLine } from '@tooling/setup/common/script.js';
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

/** The gate's steps, numbered, one per line — what `--list` prints. */
export function formatGateSteps(gate: GateName): string {
  return stepsFor(gate)
    .map((step, index) => `${index + 1}. ${step.label} — ${step.command.join(' ')}`)
    .join('\n');
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

if (isMain(import.meta.url)) {
  const usage = `usage: run-gate.ts <${GATES.join(' | ')}> [--list] (--fix with health only)`;
  let commandLine: { values: { fix?: boolean; list?: boolean }; positionals: string[] };
  try {
    commandLine = parseCommandLine({
      args: process.argv.slice(2),
      options: { fix: { type: 'boolean' }, list: { type: 'boolean' } },
      maxPositionals: 1,
    });
  } catch (error) {
    process.stderr.write(`${usage}; ${(error as Error).message}\n`);
    process.exit(2);
  }
  const { values, positionals } = commandLine;
  const [gate] = positionals;
  const known = GATES.find((candidate) => candidate === gate);
  if (!known || (values.fix && known !== 'health')) {
    process.stderr.write(`${usage}; got: ${gate ?? '(no gate)'}${values.fix ? ' --fix' : ''}\n`);
    process.exit(2);
  }
  if (values.list) {
    process.stdout.write(`${formatGateSteps(known)}\n`);
    process.exit(0);
  }
  process.exit(runGate({ gate: known, fix: values.fix === true }));
}
