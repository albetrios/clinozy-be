#!/usr/bin/env tsx
/**
 * `pnpm agent-os:review-clean [--note "<summary>"]` — records that `/be-pre-merge-review` found no
 * critical or major finding on HEAD. The push review gate (`agent-os/hooks/guardrails.mjs`) reads
 * it: a `git push` of auth, RLS, billing, migration or route changes asks the user first unless
 * HEAD has this record.
 *
 * The record is `<git dir>/be-pre-merge-review/<HEAD sha>.clean` — this clone only, never
 * committed. A new commit is a new HEAD, so it needs a new review.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitEnvironmentWithoutInheritedRepository } from '@tooling/setup/common/git-environment.js';

/** The record's folder under the git directory, read by the push review gate. */
const REVIEW_RECORD_DIRECTORY = 'be-pre-merge-review';

function git(args: string[]): string {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    env: gitEnvironmentWithoutInheritedRepository(),
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

const noteIndex = process.argv.indexOf('--note');
const note = noteIndex === -1 ? '' : (process.argv[noteIndex + 1] ?? '');
const head = git(['rev-parse', 'HEAD']);
const directory = join(git(['rev-parse', '--absolute-git-dir']), REVIEW_RECORD_DIRECTORY);
mkdirSync(directory, { recursive: true });
writeFileSync(
  join(directory, `${head}.clean`),
  `${JSON.stringify({ head, recordedAt: new Date().toISOString(), note }, null, 2)}\n`,
);
console.log(`Recorded a clean /be-pre-merge-review for HEAD ${head.slice(0, 7)}.`);
