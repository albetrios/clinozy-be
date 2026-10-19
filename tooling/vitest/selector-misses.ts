#!/usr/bin/env tsx
/**
 * `pnpm test:selector-misses --base <ref> --results <dir>` — after the full PR suite (the unit
 * job and the database matrix): the failed test files that `pnpm test:select` would have
 * skipped for this branch's changes. Each one is a selector miss — or a flake — and becomes a
 * fixture in `tooling/vitest/selector-fixtures.json`, so the selection includes it next time.
 *
 * `<dir>` holds Vitest JSON reports (`--reporter=json`), one per job or shard. It reports only:
 * annotations, the job summary, a fixture line per miss — and exits 0.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, resolveBase } from '@tooling/setup/common/git-environment.js';
import { selectTests, type TestSelection } from '@tooling/vitest/test-selection.util.js';

/** The part of a Vitest JSON report the detector reads. */
export interface VitestJsonReport {
  testResults?: { name: string; status: string }[];
}

/** The failed test files of a report, repository-relative. */
export function failedTestFiles(options: {
  report: VitestJsonReport;
  repositoryRoot: string;
}): string[] {
  return (options.report.testResults ?? [])
    .filter((result) => result.status === 'failed')
    .map((result) =>
      isAbsolute(result.name) ? relative(options.repositoryRoot, result.name) : result.name,
    )
    .map((file) => file.split('\\').join('/'));
}

/** The failed files the selection would not have run — none when it runs everything. */
export function findSelectorMisses(options: {
  failed: readonly string[];
  selection: TestSelection;
}): string[] {
  if (options.selection.mode === 'all') return [];
  const selected = new Set(Object.values(options.selection.projects).flat());
  return [...new Set(options.failed)].filter((file) => !selected.has(file)).sort();
}

/** The fixture line that makes the selection include `test` for `changedFiles`. */
export function fixtureFor(options: { changedFiles: readonly string[]; test: string }): string {
  const changed = options.changedFiles.filter(
    (file) => file.startsWith('src/') || file.startsWith('tooling/'),
  );
  return JSON.stringify({ name: `miss: ${options.test}`, changed, mustSelect: [options.test] });
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main(): void {
  const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
  const resultsDirectory = option('--results') ?? 'test-results';
  const base = git({ args: ['merge-base', 'HEAD', resolveBase({ base: option('--base') })] });
  const changedFiles = git({ args: ['diff', '--name-only', '--no-renames', `${base}...HEAD`] })
    .split('\n')
    .filter(Boolean);
  const failed = existsSync(resultsDirectory)
    ? readdirSync(resultsDirectory, { recursive: true })
        .map(String)
        .filter((file) => file.endsWith('.json'))
        .flatMap((file) =>
          failedTestFiles({
            report: JSON.parse(
              readFileSync(join(resultsDirectory, file), 'utf8'),
            ) as VitestJsonReport,
            repositoryRoot,
          }),
        )
    : [];
  const selection = selectTests({ changedFiles, repositoryRoot });
  const misses = findSelectorMisses({ failed, selection });
  const lines = [
    `Selector miss check: ${failed.length} failed test file(s), selection ${selection.mode} (${selection.reasons.join('; ')}), ${misses.length} miss(es).`,
  ];
  for (const miss of misses) {
    console.log(
      `::warning file=${miss}::pnpm test:select would have skipped this failed test — a selector miss (or a flake)`,
    );
    lines.push(
      `- ${miss} — add to tooling/vitest/selector-fixtures.json: ${fixtureFor({ changedFiles, test: miss })}`,
    );
  }
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Selector miss check\n\n${lines.join('\n')}\n`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
