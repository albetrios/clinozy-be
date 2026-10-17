/**
 * The warn-only window of the early checks — the RLS policy lint, the route access diff, the
 * lockfile dependency audit at commit, Semgrep at push and the live API probe after a deploy.
 * Each starts warn-only and blocks from {@link EARLY_CHECKS_BLOCK_FROM}; a finding judged wrong
 * in the meantime goes into {@link EARLY_CHECKS_FALSE_POSITIVE_LOG}, so the rule is tuned before
 * it blocks.
 */

/** The first day (Asia/Calcutta) the early checks block instead of warning. */
export const EARLY_CHECKS_BLOCK_FROM = '2026-10-31';

/** Where a finding the user judges wrong is recorded, one row each. */
export const EARLY_CHECKS_FALSE_POSITIVE_LOG = 'agent-os/evals/warn-only-false-positives.md';

/** Today's date in Asia/Calcutta, `YYYY-MM-DD`. */
function todayInCalcutta(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

/**
 * True while the early checks only warn (before {@link EARLY_CHECKS_BLOCK_FROM}, Asia/Calcutta).
 *
 * @remarks
 * `now` is a parameter so tests pin both sides of the date.
 */
export function isEarlyCheckWarnOnly(now: Date = new Date()): boolean {
  return todayInCalcutta(now) < EARLY_CHECKS_BLOCK_FROM;
}

/**
 * Prints an early check's findings and returns its exit code: 0 with no finding or while
 * warn-only, 1 once it blocks.
 *
 * @remarks
 * The message names the false-positive log either way, so a wrong finding is recorded rather than
 * worked around.
 */
export function reportEarlyCheck(options: {
  check: string;
  findings: readonly string[];
  now?: Date;
}): number {
  const { check, findings } = options;
  if (findings.length === 0) {
    console.log(`✓ ${check}: no findings`);
    return 0;
  }
  const warnOnly = isEarlyCheckWarnOnly(options.now);
  const heading = warnOnly
    ? `⚠ ${check}: ${findings.length} finding(s) — warn-only until ${EARLY_CHECKS_BLOCK_FROM}, then they block`
    : `✗ ${check}: ${findings.length} finding(s)`;
  console.error(heading);
  for (const finding of findings) console.error(`  - ${finding}`);
  console.error(`  A finding that is wrong: add a row to ${EARLY_CHECKS_FALSE_POSITIVE_LOG}.`);
  return warnOnly ? 0 : 1;
}
