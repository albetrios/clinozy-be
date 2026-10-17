#!/usr/bin/env tsx
/**
 * pnpm iteration:intake — store what arrived in an iteration's intake-files/, check it, or compact it.
 *
 * Usage:
 *   pnpm iteration:intake <iteration> <source> [--mode full|overlay|brief] [--both] [--sibling <path>] [--replace] [--dry-run]
 *   pnpm iteration:intake <iteration> --check [--baseline <iteration>]
 *   pnpm iteration:intake <iteration> --compact [--dry-run]
 *
 * `full` (the default; always the launch): the drop as received. `overlay`: the received files,
 * resolved over the Baseline's snapshot. `brief`: the received BRIEF.md (template:
 * tooling/iterations/templates/BRIEF.md) — the whole snapshot from scratch, or added to a named
 * Baseline's. `--check` is the gate the iteration skills run before planning and building;
 * `--compact` removes an older intake's stored copies of its Baseline's files. The model:
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
