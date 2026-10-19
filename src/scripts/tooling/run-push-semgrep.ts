/**
 * Semgrep at push on the code where a hole is a tenant leak — auth, tenancy, billing and the
 * database contexts — an early check in `.husky/pre-push`. The PR's SAST lane scans everything.
 *
 * Usage:
 *   pnpm security:semgrep:push                # files changed since the upstream (or origin/<trunk>)
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
import { resolveBase, tryGit } from '@tooling/setup/common/git-environment.js';
import { requireTool } from '@tooling/setup/common/require-tool.js';

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

function main(): void {
  const baseIndex = process.argv.indexOf('--base');
  const base = resolveBase({ base: baseIndex === -1 ? undefined : process.argv[baseIndex + 1] });
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
    console.log('Semgrep at push: no auth, tenancy, billing or database-context changes.');
    return;
  }
  // A warning, not a block: the PR's SAST lane scans everything.
  if (!requireTool({ name: 'semgrep', mode: 'warn', purpose: 'Semgrep at push' })) return;
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
