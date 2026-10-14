#!/usr/bin/env tsx
/**
 * pnpm iteration:diff — compare a Baseline's resolved intake-files/ snapshot with the current
 * iteration's (an overlay or a brief laid over its Baseline chain).
 *
 * Usage:
 *   pnpm iteration:diff [<baseline>] <current> [--json]
 *
 * Prints a summary (files, screens, PRD / schema-routes / prototype changed, schema-routes
 * entities, fields, enums, routes and operations added, removed or changed), then the raw
 * `git diff --no-index`. `--json` prints the summary only, for skills. Without a Baseline it
 * prints the recorded and suggested Baselines and exits 2, so the user can confirm one.
 */
import { resolve } from 'node:path';
import {
  formatIntakeDiffSummary,
  missingBaselineMessage,
  parseDiffArguments,
  rawIntakeDiff,
  summarizeIntakeDiff,
} from './iteration-diff.util.js';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');

const USAGE = `Usage:
  pnpm iteration:diff [<baseline>] <current> [--json]`;

function main(): void {
  const options = parseDiffArguments(process.argv.slice(2));
  if (options.help || options.current === undefined) {
    console.log(USAGE);
    process.exit(options.help ? 0 : 1);
  }
  if (options.baseline === undefined) {
    console.log(
      missingBaselineMessage({ repositoryRoot: REPOSITORY_ROOT, current: options.current }),
    );
    process.exit(2);
  }
  const request = {
    repositoryRoot: REPOSITORY_ROOT,
    baseline: options.baseline,
    current: options.current,
  };
  const summary = summarizeIntakeDiff(request);
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(formatIntakeDiffSummary(summary));
  const raw = rawIntakeDiff(request);
  console.log(`\n── git diff --no-index ──\n${raw === '' ? '(no difference)' : raw}`);
}

try {
  main();
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
