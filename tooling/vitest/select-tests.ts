#!/usr/bin/env tsx
/**
 * `pnpm test:select` — the tests a change can affect, and why (the rules:
 * `tooling/vitest/test-selection.util.ts`).
 *
 * Usage:
 *   pnpm test:select                    # changes since the merge base with the upstream (else origin/<trunk>) + the working tree
 *   pnpm test:select --base <ref>       # another base
 *   pnpm test:select --files a.ts,b.md  # these files instead of git
 *   pnpm test:select --why              # every selected test and why it was selected
 *   pnpm test:select --json             # the whole selection as JSON
 *   pnpm test:select --run              # run it: the `fast` lane in one Vitest process, then
 *                                       # the database projects one at a time (`pnpm test`
 *                                       # when everything is selected)
 *   pnpm test:select --changed-only     # only the tests picked for the change: no always-run
 *                                       # tests, and nothing when everything is selected (the
 *                                       # full suite is the signal) — PR CI's early signal
 *   pnpm test:select --lane db-bound    # with --run: only that lane of tooling/vitest/lanes.ts
 *   pnpm test:select --exclude <glob>   # leave out the tests that match (repeatable)
 *
 * It fails closed: git that cannot name the changes, like any selector error, selects everything.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { git, resolveBase } from '@tooling/setup/common/git-environment.js';
import { LANES } from '@tooling/vitest/lanes.js';
import {
  changedOnly,
  selectTests,
  type TestSelection,
  withoutTests,
} from '@tooling/vitest/test-selection.util.js';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Every value of a repeatable option. */
function options(name: string): string[] {
  return process.argv.flatMap((argument, index) => {
    const value = process.argv[index + 1];
    return argument === name && value !== undefined ? [value] : [];
  });
}

/** The changed files: `--files`, else everything since the merge base plus untracked files. */
function changedFiles(): string[] {
  const files = option('--files');
  if (files !== undefined) return files.split(',').map((file) => file.trim());
  const cwd = REPOSITORY_ROOT;
  const ref = resolveBase({ base: option('--base'), cwd });
  const base = git({ args: ['merge-base', 'HEAD', ref], cwd });
  const tracked = git({ args: ['diff', '--name-only', '--no-renames', base], cwd });
  const untracked = git({ args: ['ls-files', '--others', '--exclude-standard'], cwd });
  return `${tracked}\n${untracked}`.split('\n').filter((file) => file.trim() !== '');
}

function select(): TestSelection {
  let selection: TestSelection;
  try {
    selection = selectTests({ changedFiles: changedFiles(), repositoryRoot: REPOSITORY_ROOT });
  } catch (error) {
    const reason = `cannot list the changed files, so everything runs: ${(error as Error).message}`;
    selection = { mode: 'all', reasons: [reason], projects: {}, why: {} };
  }
  if (process.argv.includes('--changed-only')) selection = changedOnly(selection);
  return withoutTests({ selection, globs: options('--exclude') });
}

function print(selection: TestSelection): void {
  console.log(`Test selection: ${selection.mode} — ${selection.reasons.join('; ')}`);
  if (!process.argv.includes('--why')) return;
  for (const [project, tests] of Object.entries(selection.projects)) {
    console.log(`\n${project} (${tests.length})`);
    for (const test of tests) console.log(`  ${test} — ${(selection.why[test] ?? []).join('; ')}`);
  }
}

function vitest(args: string[]): number {
  console.log(
    `\n▶ vitest ${args.filter((arg) => !arg.includes('/')).join(' ')} (${args.filter((arg) => arg.includes('/')).length} files)`,
  );
  return (
    spawnSync('pnpm', ['exec', 'vitest', ...args], { cwd: REPOSITORY_ROOT, stdio: 'inherit' })
      .status ?? 1
  );
}

/** Run the selection lane by lane, as `pnpm test` does; stop at the first failure. */
function run(selection: TestSelection): number {
  if (selection.mode === 'none') return 0;
  if (selection.mode === 'all') {
    return spawnSync('pnpm', ['test'], { cwd: REPOSITORY_ROOT, stdio: 'inherit' }).status ?? 1;
  }
  const onlyLane = option('--lane');
  const lanes = onlyLane === undefined ? LANES : LANES.filter((lane) => lane.name === onlyLane);
  if (lanes.length === 0) {
    console.error(`No lane ${onlyLane} — one of ${LANES.map((lane) => lane.name).join(', ')}.`);
    return 1;
  }
  const laneProjects = new Set<string>();
  for (const lane of lanes) {
    const projects = lane.args.filter((_, index) => lane.args[index - 1] === '--project');
    for (const project of projects) laneProjects.add(project);
    const selected = projects.filter((project) => selection.projects[project]?.length);
    const groups = lane.serial ? selected.map((project) => [project]) : [selected];
    for (const group of groups) {
      if (group.length === 0) continue;
      const files = group.flatMap((project) => selection.projects[project] ?? []);
      const code = vitest(['run', ...group.flatMap((project) => ['--project', project]), ...files]);
      if (code !== 0) return code;
    }
  }
  for (const [project, tests] of Object.entries(selection.projects)) {
    if (!laneProjects.has(project)) {
      console.log(
        `Not run here: ${project} (${tests.length} files) — ${onlyLane === undefined ? `its own pnpm test:${project}` : `outside the ${onlyLane} lane`}`,
      );
    }
  }
  return 0;
}

const selection = select();
if (process.argv.includes('--json')) console.log(JSON.stringify(selection, null, 2));
else print(selection);
if (process.argv.includes('--run')) process.exitCode = run(selection);
