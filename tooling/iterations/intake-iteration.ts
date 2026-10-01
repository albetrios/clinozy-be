#!/usr/bin/env tsx
/**
 * pnpm iteration:intake — write an iteration's full snapshot into intake-files/, or check it.
 *
 * Usage:
 *   pnpm iteration:intake <iteration> <source> [--mode full|overlay|brief] [--both] [--sibling <path>] [--replace] [--dry-run]
 *   pnpm iteration:intake <iteration> --check [--baseline <iteration>]
 *
 * `full` (the default; always the launch): the drop as received. `overlay`: the Baseline's snapshot
 * with the received files laid over it. `brief`: the Baseline's snapshot plus the received BRIEF.md
 * (template: tooling/iterations/templates/BRIEF.md). `--check` is the gate the iteration skills run
 * before planning and building. The model: iterations/README.md.
 */
import { resolve } from 'node:path';
import { runIntake } from './iteration-intake.util.js';
import { resolveSiblingRoot } from './iteration.util.js';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');

try {
  const { exitCode, lines } = runIntake({
    commandLine: process.argv.slice(2),
    repositoryRoot: REPOSITORY_ROOT,
    resolveSibling: (siblingPath) =>
      resolveSiblingRoot({ repositoryRoot: REPOSITORY_ROOT, siblingPath }),
  });
  console.log(lines.join('\n'));
  process.exitCode = exitCode;
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
