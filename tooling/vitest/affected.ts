#!/usr/bin/env tsx
/**
 * `pnpm test:affected [--base <ref>]` — behind `/be-validate --affected`: what `git push` will
 * run for the commits it pushes (the one pre-push step list, `tooling/validate/pre-push-steps.ts`,
 * each step with why it runs or not), then the tests `pnpm test:select` picks for them, with why.
 *
 * Pre-push runs the unit-project files of that selection (`tooling/vitest/pre-push-tests.ts`), or
 * the whole unit project when the selection escalates.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedSince, resolveBase } from '@tooling/setup/common/git-environment.js';
import { prePushSteps } from '@tooling/validate/pre-push-steps.js';
import {
  ALWAYS_RUN_REASON,
  selectTests,
  type TestSelection,
} from '@tooling/vitest/test-selection.util.js';

/** The selection as Markdown: tests picked for a reason of their own, then the always-run counts. */
export function selectionTable(selection: TestSelection): string[] {
  const lines = [`Selection: ${selection.mode} — ${selection.reasons.join('; ')}`];
  if (selection.mode !== 'selected') return lines;
  lines.push('', '| Project | Test file | Why selected |', '| --- | --- | --- |');
  const alwaysOnly = new Map<string, number>();
  for (const [project, tests] of Object.entries(selection.projects)) {
    for (const test of tests) {
      const reasons = selection.why[test] ?? [];
      const own = reasons.filter((reason) => !reason.startsWith(ALWAYS_RUN_REASON));
      if (own.length === 0) alwaysOnly.set(project, (alwaysOnly.get(project) ?? 0) + 1);
      else lines.push(`| ${project} | \`${test}\` | ${own.join('; ')} |`);
    }
  }
  for (const [project, count] of alwaysOnly) {
    lines.push(`| ${project} | ${count} file(s) | always run (any source change) |`);
  }
  return lines;
}

function main(): void {
  const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
  const baseIndex = process.argv.indexOf('--base');
  const base = resolveBase({ base: baseIndex === -1 ? undefined : process.argv[baseIndex + 1] });
  let changedFiles: string[];
  try {
    changedFiles = changedSince({ base });
  } catch {
    console.error(`Cannot diff against ${base} — pass --base <ref>.`);
    process.exitCode = 1;
    return;
  }
  const lines = [
    `## What git push will run (${changedFiles.length} file(s) since ${base})`,
    '',
    '| Step | Runs | Why |',
    '| --- | --- | --- |',
    ...prePushSteps({ changedFiles, base }).map(
      (step) => `| \`${step.label}\` | ${step.runs ? 'yes' : 'no'} | ${step.why} |`,
    ),
    '',
    '## The tests pnpm test:select picks',
    '',
    'Pre-push runs the unit-project files of this selection (the whole unit project when it escalates). CI runs everything.',
    '',
    ...selectionTable(selectTests({ changedFiles, repositoryRoot })),
  ];
  console.log(lines.join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
