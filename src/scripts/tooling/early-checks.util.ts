/**
 * The early checks — the RLS policy lint and the lockfile dependency audit at commit, Semgrep at
 * push and the live API probe after a deploy — report their findings one way, and a finding
 * blocks. A finding the user judges wrong goes into {@link EARLY_CHECKS_FALSE_POSITIVE_LOG}, so
 * the rule gets fixed rather than worked around.
 */

/** Where a finding the user judges wrong is recorded, one row each. */
export const EARLY_CHECKS_FALSE_POSITIVE_LOG = 'agent-os/evals/false-positives.md';

/**
 * Prints an early check's findings and returns its exit code: 0 with no finding, 1 with any.
 *
 * @remarks
 * The message names the false-positive log, so a wrong finding is recorded rather than worked
 * around.
 */
export function reportEarlyCheck(options: { check: string; findings: readonly string[] }): number {
  const { check, findings } = options;
  if (findings.length === 0) {
    console.log(`✓ ${check}: no findings`);
    return 0;
  }
  console.error(`✗ ${check}: ${findings.length} finding(s)`);
  for (const finding of findings) console.error(`  - ${finding}`);
  console.error(`  A finding that is wrong: add a row to ${EARLY_CHECKS_FALSE_POSITIVE_LOG}.`);
  return 1;
}
