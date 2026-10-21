/**
 * The CI failure report email, rendered without the mail or Redis clients so it can be
 * unit-tested; `send-ci-failure-report-email.ts` gathers the failed run and sends what this
 * renders. A report names every failed job with its failed steps and its log up to the error — the
 * Markdown the ci-failure issue's fix plan (`.github/actions/ci-failure-issue/fix-plan.mjs`)
 * writes — and the merged test coverage when the run wrote it.
 */
import { baseTemplate } from '@/infrastructure/mail/templates/base.template.js';
import { escapeHtml } from '@/infrastructure/mail/templates/escape-html.util.js';
import {
  PROJECT_DISPLAY_NAME,
  PROJECT_SLUG,
} from '@/shared/constants/project-identity.constants.js';

/** One metric of istanbul's json-summary (`coverage/coverage-summary.json`). */
export interface CoverageMetric {
  pct?: number;
  covered?: number;
  total?: number;
}

/** The totals of istanbul's json-summary, which the merged CI coverage carries. */
export interface CoverageSummary {
  total?: {
    lines?: CoverageMetric;
    statements?: CoverageMetric;
    branches?: CoverageMetric;
    functions?: CoverageMetric;
  };
}

/** What a failure report says about one failed CI run. */
export interface CiFailureReport {
  /** The workflow's name (`GITHUB_WORKFLOW`), e.g. `PR CI`. */
  readonly workflowName: string;
  /** The run on GitHub Actions. */
  readonly runUrl?: string | undefined;
  /** The branch the run tested. */
  readonly branch?: string | undefined;
  /** The commit the run tested. */
  readonly commitSha?: string | undefined;
  /** Who started the run. */
  readonly actor?: string | undefined;
  /** When the report was written (ISO 8601). */
  readonly dateTime: string;
  /** The fix plan's Markdown for the run; empty when the failed jobs could not be read. */
  readonly failureDetails: string;
  /** The merged coverage, or null when the run wrote none. */
  readonly coverage: CoverageSummary | null;
}

/** The email for one failed CI run. */
export interface CiFailureReportEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

const COVERAGE_METRICS = [
  ['Lines', 'lines'],
  ['Statements', 'statements'],
  ['Branches', 'branches'],
  ['Functions', 'functions'],
] as const;

const NO_DETAILS =
  'The failed jobs could not be read (the token lacks actions: read, or GitHub did not answer). Open the run for the logs.';

const CODE_STYLE = 'font-size: 12px; background: #f3f4f6; padding: 1px 4px; border-radius: 3px;';
const LOG_BLOCK_STYLE =
  'font-size: 12px; line-height: 1.45; background: #111827; color: #e5e7eb; padding: 12px; border-radius: 6px; white-space: pre-wrap; word-break: break-word;';
const HEADING_STYLE = 'margin: 24px 0 8px; font-size: 16px; color: #111827;';
const SUBHEADING_STYLE = 'margin: 20px 0 8px; font-size: 14px; color: #991b1b;';
const CELL_STYLE = 'border: 1px solid #e5e7eb; padding: 6px; font-size: 13px;';

/**
 * The failed jobs a fix plan names, in its order: each `### <job> › <failed steps>` heading.
 *
 * @param failureDetails - the fix plan's Markdown
 * @returns one entry per failed job, the failed steps after ` › `
 */
export function failedJobsInReport(failureDetails: string): string[] {
  return failureDetails
    .split('\n')
    .filter((line) => line.startsWith('### '))
    .map((line) => line.slice(4).trim());
}

function formatPercent(value: number | undefined): string {
  return typeof value === 'number' ? `${value.toFixed(1)}%` : 'N/A';
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** Inline Markdown the fix plan writes — `**bold**` and `code` — on already-escaped text. */
function renderInline(text: string): string {
  return escapeHtml(text)
    .replaceAll(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replaceAll(/`([^`]+)`/g, `<code style="${CODE_STYLE}">$1</code>`);
}

/**
 * The fix plan's Markdown as email HTML: the subset it writes (`##`/`###` headings, `- ` items,
 * fenced log tails, paragraphs), every character of it escaped.
 */
function renderFailureDetailsHtml(markdown: string): string {
  const html: string[] = [];
  let items: string[] = [];
  let code: string[] | undefined;
  const closeList = (): void => {
    if (items.length > 0)
      html.push(`<ul style="margin: 0 0 12px; padding-left: 20px;">${items.join('')}</ul>`);
    items = [];
  };
  for (const line of markdown.split('\n')) {
    if (code !== undefined) {
      if (line.startsWith('```')) {
        html.push(`<pre style="${LOG_BLOCK_STYLE}">${escapeHtml(code.join('\n'))}</pre>`);
        code = undefined;
      } else code.push(line);
      continue;
    }
    if (line.startsWith('```')) {
      closeList();
      code = [];
    } else if (line.startsWith('- ')) {
      items.push(
        `<li style="font-size: 13px; color: #374151;">${renderInline(line.slice(2))}</li>`,
      );
    } else {
      closeList();
      if (line.startsWith('### '))
        html.push(`<h3 style="${SUBHEADING_STYLE}">${renderInline(line.slice(4))}</h3>`);
      else if (line.startsWith('## '))
        html.push(`<h2 style="${HEADING_STYLE}">${renderInline(line.slice(3))}</h2>`);
      else if (line.trim() !== '')
        html.push(`<p style="font-size: 13px;">${renderInline(line)}</p>`);
    }
  }
  if (code !== undefined)
    html.push(`<pre style="${LOG_BLOCK_STYLE}">${escapeHtml(code.join('\n'))}</pre>`);
  closeList();
  return html.join('\n');
}

function coverageLines(coverage: CoverageSummary | null): string[] {
  const total = coverage?.total;
  if (!total) return [];
  return COVERAGE_METRICS.map(([label, key]) => {
    const metric = total[key];
    return `  ${label.padEnd(10)}: ${formatPercent(metric?.pct)} (covered ${metric?.covered ?? 0} of ${metric?.total ?? 0})`;
  });
}

function coverageTableHtml(coverage: CoverageSummary | null): string {
  const total = coverage?.total;
  if (!total) return '';
  const rows = COVERAGE_METRICS.map(([label, key]) => {
    const metric = total[key];
    return `<tr><td style="${CELL_STYLE}">${label}</td><td style="${CELL_STYLE}">${formatPercent(metric?.pct)}</td><td style="${CELL_STYLE}">${metric?.covered ?? 0} / ${metric?.total ?? 0}</td></tr>`;
  });
  return `<h2 style="${HEADING_STYLE}">Coverage (merged test matrix)</h2>
<table cellpadding="0" cellspacing="0" style="border-collapse: collapse; width: 100%;">
  <tr><th align="left" style="${CELL_STYLE}">Metric</th><th align="left" style="${CELL_STYLE}">Coverage</th><th align="left" style="${CELL_STYLE}">Covered / total</th></tr>
  ${rows.join('\n  ')}
</table>`;
}

/**
 * The failure report email for one failed CI run: the subject names the workflow, the branch and
 * the first failed job; the body lists every failed job, then the fix plan (each job's failed
 * steps and log up to its error), then the merged coverage when the run wrote it.
 *
 * @param report - the failed run, its fix plan and its coverage
 * @returns the subject, the plain-text body and the HTML body
 */
export function renderCiFailureReport(report: CiFailureReport): CiFailureReportEmail {
  const jobs = failedJobsInReport(report.failureDetails);
  const jobNames = jobs.map((job) => job.split(' › ')[0] ?? job);
  const onBranch = report.branch ? ` on ${report.branch}` : '';
  const firstJob = jobNames[0] ? `: ${jobNames[0]}` : '';
  const moreJobs = jobNames.length > 1 ? ` (+${jobNames.length - 1} more)` : '';
  const subject = `${PROJECT_SLUG} ${report.workflowName} failed${onBranch}${firstJob}${moreJobs}`;
  const title = `${report.workflowName} failed${onBranch}`;

  const context: [string, string][] = [['Workflow', report.workflowName]];
  if (report.branch) context.push(['Branch', report.branch]);
  if (report.commitSha)
    context.push(['Commit', `${shortSha(report.commitSha)} by ${report.actor ?? 'unknown'}`]);
  context.push(['Time', report.dateTime]);
  if (report.runUrl) context.push(['Run', report.runUrl]);

  const details = report.failureDetails.trim();
  const coverage = coverageLines(report.coverage);
  const text = [
    `${PROJECT_DISPLAY_NAME} CI failure report: ${title}`,
    '',
    ...context.map(([label, value]) => `${label.padEnd(8)}: ${value}`),
    '',
    'Failed jobs:',
    ...(jobs.length > 0 ? jobs.map((job) => `  - ${job}`) : ['  (not read: open the run)']),
    '',
    details || NO_DETAILS,
    ...(coverage.length > 0 ? ['', 'Coverage (merged test matrix):', ...coverage] : []),
  ].join('\n');

  const contextRows = context
    .filter(([label]) => label !== 'Run')
    .map(
      ([label, value]) =>
        `<tr><td style="padding: 2px 12px 2px 0; font-weight: 600; font-size: 13px;">${label}</td><td style="font-size: 13px;">${escapeHtml(value)}</td></tr>`,
    );
  const runButton = report.runUrl
    ? `<p><a class="button" href="${escapeHtml(report.runUrl)}">Open the run</a></p>`
    : '';
  const jobList =
    jobs.length > 0
      ? `<ul style="margin: 0 0 12px; padding-left: 20px;">${jobs.map((job) => `<li style="font-size: 13px; color: #374151;">${escapeHtml(job)}</li>`).join('')}</ul>`
      : '<p style="font-size: 13px;">Not read: open the run.</p>';
  const body = `<h1>${escapeHtml(title)}</h1>
<table cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">${contextRows.join('')}</table>
${runButton}
<h2 style="${HEADING_STYLE}">Failed jobs</h2>
${jobList}
${details ? renderFailureDetailsHtml(details) : `<p style="font-size: 13px;">${escapeHtml(NO_DETAILS)}</p>`}
${coverageTableHtml(report.coverage)}`;

  return {
    subject,
    text,
    html: baseTemplate({
      title: subject,
      preheader: jobs.length > 0 ? `Failed: ${jobNames.join(', ')}` : title,
      body,
      footerText: `${PROJECT_DISPLAY_NAME} CI sends this report only when a run fails.`,
    }),
  };
}
