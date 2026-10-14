#!/usr/bin/env tsx
/**
 * pnpm iteration:intake — store what arrived in an iteration's intake-files/, check it, or compact it.
 *
 * Usage:
 *   pnpm iteration:intake <iteration> <source> [--mode full|overlay|brief] [--both] [--sibling <path>] [--replace] [--dry-run]
 *   pnpm iteration:intake <iteration> --check [--baseline <iteration>]
 *   pnpm iteration:intake <iteration> --compact [--dry-run]
 *
 * intake-files/ stores only what arrived. `full` (the default; always the launch): the whole drop.
 * `overlay`: the received files. `brief`: the received BRIEF.md (template:
 * tooling/iterations/templates/BRIEF.md). An overlay or a brief resolves the rest of its snapshot
 * from its Baseline. `--check` is the gate the iteration skills run before planning and building;
 * `--compact` removes the copies of Baseline files an older overlay or brief stored. The model:
 * iterations/README.md.
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
