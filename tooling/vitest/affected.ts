#!/usr/bin/env tsx
/**
 * `pnpm test:affected [--base <ref>]` — behind `/be-validate --affected`: what `git push` will
 * run for the commits it pushes (the steps of `.husky/pre-push`, each with why it runs or not),
 * then the tests `pnpm test:select` picks for them, with why each was picked.
 *
 * Pre-push runs `pnpm test:unit` in full today; the selected set is what it will run once the
 * selector miss check has shown no miss for two weeks. The steps mirror `.husky/pre-push`
 * (`src/tests/unit/tooling/affected.policy.unit.test.ts` keeps the two in step).
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pushSemgrepTargets } from '@/scripts/tooling/run-push-semgrep.js';
import { gitEnvironmentWithoutInheritedRepository } from '@tooling/setup/common/git-environment.js';
import { selectTests, type TestSelection } from '@tooling/vitest/test-selection.util.js';

/** One pre-push step: the command, and whether the pushed files make it run. */
export interface PushStep {
  command: string;
  runs: boolean;
  why: string;
}

/** The files that make pre-push run the unit project (its `PUSHED_UNIT_RELEVANT` pattern). */
export const UNIT_RELEVANT =
  /^(src\/|tooling\/vitest\/|vitest\.config\.ts$|package\.json$|pnpm-lock\.yaml$)/;

/** The steps of `.husky/pre-push` for the pushed files, in its order. */
export function pushSteps(changedFiles: readonly string[]): PushStep[] {
  const markdown = changedFiles.some((file) => file.endsWith('.md'));
  const sourceOrTooling = changedFiles.some((file) => /^(src|tooling)\//.test(file));
  const semgrep = pushSemgrepTargets(changedFiles);
  const unitRelevant = changedFiles.some((file) => UNIT_RELEVANT.test(file));
  const always = (command: string): PushStep => ({ command, runs: true, why: 'always' });
  return [
    always('branch-name policy'),
    always('pnpm typecheck'),
    always('pnpm build'),
    always('pnpm build:check'),
    {
      command: 'pnpm docs:lint:changed',
      runs: markdown,
      why: markdown ? 'pushed Markdown' : 'no Markdown pushed',
    },
    ...[
      'pnpm tool:project-structure-tree:check',
      'pnpm routes:catalog:check',
      'pnpm validate:route-organization-scope',
    ].map(
      (command): PushStep => ({
        command,
        runs: sourceOrTooling,
        why: sourceOrTooling ? 'pushed src/ or tooling/' : 'no src/ or tooling/ pushed',
      }),
    ),
    {
      command: 'pnpm security:semgrep:push',
      runs: semgrep.length > 0,
      why:
        semgrep.length > 0
          ? `${semgrep.length} auth / tenancy / billing / database-context file(s)`
          : 'none of auth, tenancy, billing, database contexts',
    },
    {
      command: 'pnpm test:unit',
      runs: unitRelevant,
      why: unitRelevant
        ? 'pushed unit-relevant files — the whole unit project'
        : 'nothing unit-relevant pushed',
    },
  ];
}

const ALWAYS_RUN_REASON = /^always run/;

/** The selection as Markdown: tests picked for a reason of their own, then the always-run counts. */
export function selectionTable(selection: TestSelection): string[] {
  const lines = [`Selection: ${selection.mode} — ${selection.reasons.join('; ')}`];
  if (selection.mode !== 'selected') return lines;
  lines.push('', '| Project | Test file | Why selected |', '| --- | --- | --- |');
  const alwaysOnly = new Map<string, number>();
  for (const [project, tests] of Object.entries(selection.projects)) {
    for (const test of tests) {
      const reasons = selection.why[test] ?? [];
      const own = reasons.filter((reason) => !ALWAYS_RUN_REASON.test(reason));
      if (own.length === 0) alwaysOnly.set(project, (alwaysOnly.get(project) ?? 0) + 1);
      else lines.push(`| ${project} | \`${test}\` | ${own.join('; ')} |`);
    }
  }
  for (const [project, count] of alwaysOnly) {
    lines.push(`| ${project} | ${count} file(s) | always run (any source change) |`);
  }
  return lines;
}

function git(args: string[]): { ok: boolean; output: string } {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    env: gitEnvironmentWithoutInheritedRepository(),
  });
  return { ok: result.status === 0, output: result.stdout.trim() };
}

function main(): void {
  const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
  const baseIndex = process.argv.indexOf('--base');
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const base =
    (baseIndex === -1 ? undefined : process.argv[baseIndex + 1]) ??
    (upstream.ok ? upstream.output : 'origin/main');
  const changed = git(['diff', '--name-only', '--no-renames', `${base}...HEAD`]);
  if (!changed.ok) {
    console.error(`Cannot diff against ${base} — pass --base <ref>.`);
    process.exitCode = 1;
    return;
  }
  const changedFiles = changed.output.split('\n').filter(Boolean);
  const lines = [
    `## What git push will run (${changedFiles.length} file(s) since ${base})`,
    '',
    '| Step | Runs | Why |',
    '| --- | --- | --- |',
    ...pushSteps(changedFiles).map(
      (step) => `| \`${step.command}\` | ${step.runs ? 'yes' : 'no'} | ${step.why} |`,
    ),
    '',
    '## The tests pnpm test:select picks',
    '',
    'Pre-push runs the whole unit project today; this is what it will run once the selector miss check has shown no miss for two weeks. CI runs everything.',
    '',
    ...selectionTable(selectTests({ changedFiles, repositoryRoot })),
  ];
  console.log(lines.join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
