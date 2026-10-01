#!/usr/bin/env tsx
/**
 * pnpm iteration:baseline — record the Baseline the user confirmed for an iteration.
 *
 * Usage:
 *   pnpm iteration:baseline <iteration> <baseline|none>
 *
 * The Baseline is `none` (initial) or an existing earlier iteration in this repository. Writes the
 * README's Baseline row and appends a History line (date · Baseline from → to · — · who).
 */
import { writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { planBaselineChange } from './iteration.util.js';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');

const USAGE = `Usage:
  pnpm iteration:baseline <iteration> <baseline|none>`;

function main(): void {
  const commandLine = process.argv.slice(2);
  if (commandLine.includes('--help') || commandLine.includes('-h') || commandLine.length !== 2) {
    console.log(USAGE);
    process.exit(commandLine.length === 2 ? 0 : 1);
  }
  const [iteration, baseline] = commandLine;
  const plan = planBaselineChange({ repositoryRoot: REPOSITORY_ROOT, iteration, baseline });
  writeFileSync(plan.readmePath, plan.content);
  console.log(
    [
      `${iteration}: Baseline ${plan.from} → ${plan.to}`,
      `History: ${plan.historyEntry.slice(2)}`,
      `Written: ${relative(REPOSITORY_ROOT, plan.readmePath)}`,
    ].join('\n'),
  );
}

try {
  main();
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
