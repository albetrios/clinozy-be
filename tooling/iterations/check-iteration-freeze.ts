#!/usr/bin/env tsx
/**
 * pnpm iteration:freeze-check — the merge-time freeze check (PR CI's Iteration freeze lane).
 *
 * Usage:
 *   pnpm iteration:freeze-check [--base <ref>]      # default origin/<default branch>
 *
 * Every iteration the branch changes since its merge base with <ref> must be `frozen`, and a merged
 * frozen iteration may change only by `pnpm iteration:intake <iteration> --compact`. Exits 1 with
 * one line per problem, each naming its fix. The rules: iterations/README.md.
 */
import { resolve } from 'node:path';
import { resolveGitMetadata } from '@tooling/setup/codegen/project-identity.util.js';
import { loadConfig } from '@tooling/setup/common/config.js';
import { checkIterationFreeze } from './iteration-freeze.util.js';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');

const USAGE = `Usage:
  pnpm iteration:freeze-check [--base <ref>]`;

function main(): void {
  const commandLine = process.argv.slice(2);
  if (commandLine.includes('--help') || commandLine.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const baseIndex = commandLine.indexOf('--base');
  const base =
    baseIndex === -1
      ? `origin/${resolveGitMetadata(loadConfig()).defaultBranch}`
      : commandLine[baseIndex + 1];
  if (base === undefined || base.startsWith('--')) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const { touched, problems } = checkIterationFreeze({ repositoryRoot: REPOSITORY_ROOT, base });
  if (problems.length === 0) {
    console.log(
      touched.length === 0
        ? `Iteration freeze: no iteration changed since ${base}.`
        : `Iteration freeze: ${touched.length} changed iteration(s), each frozen or compacted — ${touched.join(', ')}.`,
    );
    return;
  }
  const annotate = process.env.GITHUB_ACTIONS === 'true';
  for (const problem of problems) console.error(annotate ? `::error::${problem}` : `✗ ${problem}`);
  console.error(
    `Iteration freeze failed — ${problems.length} problem${problems.length === 1 ? '' : 's'}.`,
  );
  process.exitCode = 1;
}

main();
