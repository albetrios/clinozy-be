#!/usr/bin/env tsx
/**
 * pnpm iteration:status — move a design iteration along its lifecycle.
 *
 * Usage:
 *   pnpm iteration:status <iteration> <status> [--reason "<text>"]
 *
 * Allowed: one step forward along planning → ready-for-approval → approved → implementing →
 * done → frozen; ready-for-approval, approved or implementing back to planning with --reason.
 * Writes the README's Status row and appends a History entry (date · from → to · reason · who).
 * The model: iterations/README.md.
 */
import { writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { parseStatusArguments, planStatusChange } from './iteration.util.js';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');

const USAGE = `Usage:
  pnpm iteration:status <iteration> <status> [--reason "<text>"]

  status: planning → ready-for-approval → approved → implementing → done → frozen (one step forward)
          or back to planning from ready-for-approval, approved or implementing (needs --reason)`;

function main(): void {
  const options = parseStatusArguments(process.argv.slice(2));
  if (options.help || options.iteration === undefined) {
    console.log(USAGE);
    process.exit(options.help ? 0 : 1);
  }
  const plan = planStatusChange({ repositoryRoot: REPOSITORY_ROOT, ...options });
  writeFileSync(plan.readmePath, plan.content);
  console.log(
    [
      `${options.iteration}: ${plan.from} → ${plan.to}`,
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
