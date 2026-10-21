import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const REPORT = './.github/workflows/reusable-ci-failure-report-email.yml';
const prCi = readFileSync('.github/workflows/pr-ci.yml', 'utf8');
const postMergeCi = readFileSync('.github/workflows/post-merge-ci.yml', 'utf8');
const report = readFileSync(REPORT, 'utf8');
const databaseTests = readFileSync('.github/workflows/reusable-vitest-postgres-redis.yml', 'utf8');

/** A workflow's `  <name>:` job, up to the next job. */
function jobBlock({ workflow, name }: { workflow: string; name: string }): string {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  expect(start, `the ${name} job`).toBeGreaterThan(-1);
  const next = workflow.slice(start + 1).search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

/** A job's `needs:` list, up to its `if:`. */
function needsOf(job: string): string {
  return job.slice(job.indexOf('    needs:'), job.indexOf('    if:'));
}

/**
 * The CI failure report email (reusable-ci-failure-report-email.yml): one email per failed run,
 * none for a green one, sent from the end of the run so that it sees every lane. It replaced a
 * per-run test report that went out for green runs too and knew only the test lanes — and hung
 * for ten minutes on #134 while the failures it should have reported went unsent.
 */
describe('CI failure report email', () => {
  it('PR CI sends it once the Quality gate fails, never for a cancelled run, outside the gate', () => {
    const job = jobBlock({ workflow: prCi, name: 'failure-report' });
    expect(job).toContain(`uses: ${REPORT}`);
    expect(job).toContain('needs: [quality-gate]');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression syntax, asserted verbatim
    expect(job).toContain("if: ${{ !cancelled() && needs.quality-gate.result == 'failure' }}");
    expect(job).toContain('secrets: inherit');
    expect(jobBlock({ workflow: prCi, name: 'quality-gate' })).not.toContain('- failure-report');
  });

  it('post-merge CI sends it when a job fails or times out, never for a cancelled run', () => {
    const job = jobBlock({ workflow: postMergeCi, name: 'failure-report' });
    expect(job).toContain(`uses: ${REPORT}`);
    expect(job).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression syntax, asserted verbatim
      "if: ${{ !cancelled() && (contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled')) }}",
    );
    expect(job).toContain('secrets: inherit');
    // The jobs the post-merge ci-failure issue reports on.
    expect(needsOf(job)).toBe(needsOf(jobBlock({ workflow: postMergeCi, name: 'notify-failure' })));
  });

  it('reads the failed jobs with the fix plan and never fails the run it reports', () => {
    expect(report).toContain('run: node .github/actions/ci-failure-issue/fix-plan.mjs');
    const send = report.slice(report.indexOf('- name: Send the failure report email'));
    expect(send).toContain('continue-on-error: true');
    expect(send).toContain('pnpm tool:ci-failure-report-email --details');
  });

  it('is the one CI email for a run: the test workflow sends none', () => {
    expect(databaseTests).not.toMatch(/email/i);
  });
});
