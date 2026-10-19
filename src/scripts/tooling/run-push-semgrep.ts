/**
 * Semgrep at push on the code where a hole is a tenant leak — auth, tenancy, billing and the
 * database contexts — an early check in `.husky/pre-push`. The PR's SAST lane scans everything.
 *
 * Usage:
 *   pnpm security:semgrep:push                # files changed since the upstream (or origin/main)
 *   pnpm security:semgrep:push --base <ref>   # files changed since <ref>
 *
 * Same rules as CI (`--config p/default`, only findings new since the base). Semgrep missing, or
 * a Semgrep error (no network for the registry rules), warns and passes — CI still scans.
 * A finding blocks (`src/scripts/tooling/early-checks.util.ts`).
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportEarlyCheck } from '@/scripts/tooling/early-checks.util.js';

/** The code Semgrep scans at push: where a missed check leaks another organization's data. */
export const PUSH_SEMGREP_PATTERNS = [
  /^src\/domains\/(?:auth|tenancy|billing)\/.+\.ts$/,
  /^src\/infrastructure\/database\/contexts\/.+\.ts$/,
];

/** The changed files Semgrep scans at push — test files excluded. */
export function pushSemgrepTargets(changedFiles: readonly string[]): string[] {
  return changedFiles.filter(
    (file) =>
      PUSH_SEMGREP_PATTERNS.some((pattern) => pattern.test(file)) &&
      !(file.includes('/__tests__/') || file.endsWith('.test.ts')),
  );
}

function git(args: string[]): { ok: boolean; output: string } {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return { ok: result.status === 0, output: result.stdout.trim() };
}

function main(): void {
  const baseIndex = process.argv.indexOf('--base');
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const base =
    (baseIndex === -1 ? undefined : process.argv[baseIndex + 1]) ??
    (upstream.ok ? upstream.output : 'origin/main');
  const mergeBase = git(['merge-base', 'HEAD', base]);
  if (!mergeBase.ok) {
    console.warn(`⚠ Semgrep at push: cannot find the merge base with ${base}; skipped (CI scans)`);
    return;
  }
  const changed = git(['diff', '--name-only', '--diff-filter=ACMR', `${mergeBase.output}...HEAD`]);
  const targets = pushSemgrepTargets(changed.output.split('\n'));
  if (targets.length === 0) {
    console.log('Semgrep at push: no auth, tenancy, billing or database-context changes.');
    return;
  }
  if (spawnSync('semgrep', ['--version'], { encoding: 'utf8' }).status !== 0) {
    console.warn(
      '⚠ Semgrep at push: semgrep is not installed (SEMGREP_VERSION in tooling/setup/agent/tool-versions.sh); skipped — the PR SAST lane scans',
    );
    return;
  }
  console.log(`Semgrep at push: ${targets.length} file(s) in auth, tenancy, billing, contexts`);
  const scan = spawnSync(
    'semgrep',
    [
      'scan',
      '--config',
      'p/default',
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

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
