/**
 * Semgrep at push on every changed code file under `src/` and `tooling/`, tests included — an
 * early check in `.husky/pre-push`. The PR's SAST lane scans the whole repository, so the push
 * scans what that lane would flag. It scanned only auth, tenancy, billing and the database
 * contexts until the planted-bug drill (20 Oct 2026) showed an app-domain validator's ReDoS-prone
 * regex reach the PR unscanned, and it skipped test files until #124's PR SAST failed on one.
 *
 * Usage:
 *   pnpm security:semgrep:push                # files changed since the upstream (or origin/<trunk>)
 *   pnpm security:semgrep:push --base <ref>   # files changed since <ref>
 *
 * Same rules as CI ({@link SEMGREP_CONFIGS}: the registry's p/default and this repository's
 * `tooling/semgrep/rules.yml`), only findings new since the base. Semgrep missing, or
 * a Semgrep error (no network for the registry rules), warns and passes — CI still scans.
 * A finding blocks (`src/scripts/tooling/early-checks.util.ts`).
 */
import { spawnSync } from 'node:child_process';
import { reportEarlyCheck } from '@/scripts/tooling/early-checks.util.js';
import { resolveBase, tryGit } from '@tooling/setup/common/git-environment.js';
import { requireTool } from '@tooling/setup/common/require-tool.js';
import { isMain, parseCommandLine } from '@tooling/setup/common/script.js';

/** The code Semgrep scans at push: every TypeScript and JavaScript file under `src/` and `tooling/`. */
export const PUSH_SEMGREP_PATTERNS = [/^(?:src|tooling)\/.+\.(?:ts|mts|js|mjs)$/];

/**
 * The rules Semgrep runs, at push and in PR CI's Semgrep SAST step alike: the registry's
 * `p/default`, and this repository's own rules for the gaps it leaves.
 */
export const SEMGREP_CONFIGS = ['p/default', 'tooling/semgrep/rules.yml'];

/** The changed files Semgrep scans at push — test files too, as PR SAST scans them. */
export function pushSemgrepTargets(changedFiles: readonly string[]): string[] {
  return changedFiles.filter((file) => PUSH_SEMGREP_PATTERNS.some((pattern) => pattern.test(file)));
}

function main(): void {
  const { values } = parseCommandLine({
    args: process.argv.slice(2),
    options: { base: { type: 'string' } },
  });
  const base = resolveBase({ base: values.base });
  const mergeBase = tryGit({ args: ['merge-base', 'HEAD', base] });
  if (!mergeBase.ok) {
    console.warn(`⚠ Semgrep at push: cannot find the merge base with ${base}; skipped (CI scans)`);
    return;
  }
  const changed = tryGit({
    args: ['diff', '--name-only', '--diff-filter=ACMR', `${mergeBase.output}...HEAD`],
  });
  const targets = pushSemgrepTargets(changed.output.split('\n'));
  if (targets.length === 0) {
    console.log('Semgrep at push: no code changes under src/ or tooling/.');
    return;
  }
  // A warning, not a block: the PR's SAST lane scans everything.
  if (!requireTool({ name: 'semgrep', mode: 'warn', purpose: 'Semgrep at push' })) return;
  console.log(`Semgrep at push: ${targets.length} source file(s)`);
  const scan = spawnSync(
    'semgrep',
    [
      'scan',
      ...SEMGREP_CONFIGS.flatMap((config) => ['--config', config]),
      '--metrics',
      'off',
      '--error',
      '--quiet',
      '--baseline-commit',
      mergeBase.output,
      ...targets,
    ],
    { stdio: 'inherit' },
  );
  if (scan.status === 0) {
    console.log('✓ Semgrep at push: no new findings');
    return;
  }
  if (scan.status !== 1) {
    console.warn(`⚠ Semgrep at push: semgrep exited ${scan.status ?? 'without a code'}; skipped`);
    return;
  }
  process.exitCode = reportEarlyCheck({
    check: 'Semgrep at push',
    findings: [`semgrep reported new findings in ${targets.length} file(s) — see above`],
  });
}

if (isMain(import.meta.url)) {
  main();
}
