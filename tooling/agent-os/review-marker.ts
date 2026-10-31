#!/usr/bin/env tsx
/**
 * `pnpm agent-os:review-clean [--note "<summary>"]` — records that `/be-pre-merge-review` found no
 * critical or major finding on HEAD. The push review gate (`agent-os/hooks/be-guardrails.mjs`) reads
 * it: a `git push` of auth, RLS, billing, migration or route changes warns the agent to run the
 * review unless HEAD has this record.
 *
 * The record is `<git dir>/be-pre-merge-review/<HEAD sha>.clean` — this clone only, never
 * committed. A new commit is a new HEAD, so it needs a new review.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { git } from '@tooling/setup/common/git-environment.js';
import { parseCommandLine } from '@tooling/setup/common/script.js';

/** The record's folder under the git directory, read by the push review gate. */
const REVIEW_RECORD_DIRECTORY = 'be-pre-merge-review';

const note =
  parseCommandLine({ args: process.argv.slice(2), options: { note: { type: 'string' } } }).values
    .note ?? '';
const head = git({ args: ['rev-parse', 'HEAD'] });
const directory = join(git({ args: ['rev-parse', '--absolute-git-dir'] }), REVIEW_RECORD_DIRECTORY);
mkdirSync(directory, { recursive: true });
writeFileSync(
  join(directory, `${head}.clean`),
  `${JSON.stringify({ head, recordedAt: new Date().toISOString(), note }, null, 2)}\n`,
);
console.log(`Recorded a clean /be-pre-merge-review for HEAD ${head.slice(0, 7)}.`);
