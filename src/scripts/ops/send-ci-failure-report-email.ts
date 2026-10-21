/**
 * Emails the failure report of a failed CI run: `pnpm tool:ci-failure-report-email --details <file>`.
 * `<file>` holds the run's failed jobs with their failed steps and logs up to the error, as the
 * ci-failure issue's fix plan (`.github/actions/ci-failure-issue/fix-plan.mjs`) writes them; the
 * merged coverage comes from `coverage/coverage-summary.json` when the run wrote it. Only
 * `reusable-ci-failure-report-email.yml` calls it, and only after a run failed: a green run sends nothing.
 * Needs RESEND_API_KEY, EMAIL_FROM_ADDRESS and TEST_RESULT_EMAIL_TO (comma-separated); without
 * them it says which is missing and exits 0.
 */
import '@/shared/config/load-env-files.js';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { closeRedis } from '@/infrastructure/cache/redis.client.js';
import { isMailConfigured, sendEmail } from '@/infrastructure/mail/mail.service.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { parseCommandLine } from '@tooling/setup/common/script.js';
import { type CoverageSummary, renderCiFailureReport } from './ci-failure-report-email.render.js';

function loadCoverageSummary(): CoverageSummary | null {
  const coveragePath = path.resolve(process.cwd(), 'coverage', 'coverage-summary.json');
  if (!existsSync(coveragePath)) return null;
  try {
    return JSON.parse(readFileSync(coveragePath, 'utf-8')) as CoverageSummary;
  } catch (error) {
    logger.error({ error, coveragePath }, 'ci-failure-report.coverage-summary.parse.failed');
    return null;
  }
}

function readFailureDetails(detailsPath: string | undefined): string {
  if (!(detailsPath && existsSync(detailsPath))) {
    logger.warn({ detailsPath }, 'ci-failure-report.details.missing');
    return '';
  }
  return readFileSync(detailsPath, 'utf-8');
}

async function sendReport(): Promise<void> {
  const { values } = parseCommandLine({
    args: process.argv.slice(2),
    options: { details: { type: 'string' } },
    usage: 'pnpm tool:ci-failure-report-email -- --details <file>',
  });
  if (!isMailConfigured()) {
    logger.warn('RESEND_API_KEY is not set; skipping the CI failure report email.');
    return;
  }
  const to = (process.env.TEST_RESULT_EMAIL_TO ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (to.length === 0) {
    logger.warn('TEST_RESULT_EMAIL_TO names no recipient; skipping the CI failure report email.');
    return;
  }

  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  const email = renderCiFailureReport({
    workflowName: process.env.GITHUB_WORKFLOW ?? 'CI',
    runUrl: repository && runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : undefined,
    // A pull request's run is named after its merge ref; the head branch is the one people know.
    branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME,
    commitSha: process.env.HEAD_SHA || process.env.GITHUB_SHA,
    actor: process.env.GITHUB_ACTOR,
    dateTime: new Date().toISOString(),
    failureDetails: readFailureDetails(values.details),
    coverage: loadCoverageSummary(),
  });

  const messageId = await sendEmail({
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    tags: [{ name: 'type', value: 'ci-failure-report' }],
  });
  logger.info({ to, messageId }, 'ci-failure-report.email.send.success');
}

// The send goes through the Redis-backed circuit breaker, so the shared Redis client stays open
// after it; without this close the process never exits (the CI job hung until its 10-minute timeout).
async function main(): Promise<void> {
  try {
    await sendReport();
  } finally {
    await closeRedis();
  }
}

main().catch((error) => {
  logger.error({ error }, 'ci-failure-report.email.failed');
  process.exitCode = 1;
});
