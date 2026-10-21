import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_REPOSITORY, PROJECT_SLUG } from '@/shared/constants/project-identity.constants.js';
import {
  type CiFailureReport,
  failedJobsInReport,
  renderCiFailureReport,
} from '@/scripts/ops/ci-failure-report-email.render.js';
import { beforeAll, describe, expect, it } from 'vitest';

interface FixPlanJob {
  name: string;
  steps: string[];
  tail: string[];
}

/** The one export of `.github/actions/ci-failure-issue/fix-plan.mjs` the report reads from. */
interface FixPlanModule {
  renderFixPlan(options: { repository: string; jobs: FixPlanJob[]; routes: readonly [] }): string;
}

const FIX_PLAN = join(process.cwd(), '.github', 'actions', 'ci-failure-issue', 'fix-plan.mjs');

let fixPlan: FixPlanModule;

beforeAll(async () => {
  fixPlan = (await import(pathToFileURL(FIX_PLAN).href)) as FixPlanModule;
});

/** The fix plan the report job writes for these failed jobs: the real renderer, not a copy. */
function failureDetailsFor(jobs: FixPlanJob[]): string {
  return fixPlan.renderFixPlan({ repository: PROJECT_REPOSITORY, jobs, routes: [] });
}

function report(overrides: Partial<CiFailureReport> = {}): CiFailureReport {
  return {
    workflowName: 'PR CI',
    runUrl: 'https://github.com/example/repository/actions/runs/42',
    branch: 'fix/some-change',
    commitSha: 'fad03d3496636411b7bc6a5371401d328e45ef81',
    actor: 'someone',
    dateTime: '2026-10-21T05:14:17.000Z',
    failureDetails: '',
    coverage: null,
    ...overrides,
  };
}

const SONAR: FixPlanJob = {
  name: 'SonarQube',
  steps: ['Scan'],
  tail: ['Quality gate failed: 2 new issues', '##[error]Process completed with exit code 1.'],
};
const EMAIL: FixPlanJob = {
  name: 'matrix-tests / Test report email',
  steps: ['Send the test report email'],
  tail: ['{"msg":"redis.reconnecting"}', '##[error]The operation was canceled.'],
};
const GATE: FixPlanJob = {
  name: 'Quality gate',
  steps: ['Aggregate required-lane results'],
  tail: [],
};

/**
 * The CI failure report email (`pnpm tool:ci-failure-report-email`): one per failed run, naming
 * every failed job with its log up to the error.
 */
describe('CI failure report email', () => {
  it('reads every failed job, with its failed steps, from the fix plan', () => {
    expect(failedJobsInReport(failureDetailsFor([SONAR, EMAIL, GATE]))).toEqual([
      'SonarQube › Scan',
      'matrix-tests / Test report email › Send the test report email',
      'Quality gate › Aggregate required-lane results',
    ]);
  });

  it('names the workflow, the branch and the first failed job in the subject, and counts the rest', () => {
    const email = renderCiFailureReport(
      report({ failureDetails: failureDetailsFor([SONAR, EMAIL, GATE]) }),
    );
    expect(email.subject).toBe(
      `${PROJECT_SLUG} PR CI failed on fix/some-change: SonarQube (+2 more)`,
    );
    expect(
      renderCiFailureReport(report({ failureDetails: failureDetailsFor([SONAR]) })).subject,
    ).toBe(`${PROJECT_SLUG} PR CI failed on fix/some-change: SonarQube`);
  });

  it('carries each failed job and its log tail in both bodies', () => {
    const email = renderCiFailureReport(
      report({ failureDetails: failureDetailsFor([SONAR, EMAIL]) }),
    );
    for (const body of [email.text, email.html]) {
      expect(body).toContain('SonarQube › Scan');
      expect(body).toContain('matrix-tests / Test report email › Send the test report email');
      expect(body).toContain('Quality gate failed: 2 new issues');
      expect(body).toContain('##[error]The operation was canceled.');
    }
    expect(email.text).toContain('Commit  : fad03d3 by someone');
    expect(email.html).toContain('href="https://github.com/example/repository/actions/runs/42"');
    // The fix plan's Markdown becomes headings, items and a log block, not raw Markdown.
    expect(email.html).toMatch(/<h3 [^>]*>SonarQube › Scan<\/h3>/);
    expect(email.html).toMatch(
      /<li [^>]*><strong>Owning area:<\/strong> not named in the log<\/li>/,
    );
    expect(email.html).toMatch(
      /<pre [^>]*>Quality gate failed: 2 new issues\n##\[error\]Process completed/,
    );
    expect(email.html).not.toContain('```');
  });

  it('escapes what a log carries', () => {
    const email = renderCiFailureReport(
      report({
        failureDetails: failureDetailsFor([
          { name: 'Lint <script>', steps: [], tail: ['<img src=x onerror=alert(1)> & "quoted"'] },
        ]),
      }),
    );
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;');
    expect(email.html).toContain('Lint &lt;script&gt;');
    expect(email.html).not.toContain('<img');
    expect(email.html).not.toContain('<script>');
  });

  it('points at the run when the failed jobs could not be read', () => {
    const email = renderCiFailureReport(report());
    expect(email.subject).toBe(`${PROJECT_SLUG} PR CI failed on fix/some-change`);
    expect(email.text).toContain('The failed jobs could not be read');
    expect(email.html).toContain('The failed jobs could not be read');
    expect(email.html).toContain('Open the run');
  });

  it('adds the merged coverage when the run wrote it, and leaves it out when not', () => {
    const coverage = {
      total: {
        lines: { pct: 96.4, covered: 964, total: 1000 },
        statements: { pct: 94.7, covered: 947, total: 1000 },
        branches: { pct: 85.6, covered: 856, total: 1000 },
        functions: { pct: 97.4, covered: 974, total: 1000 },
      },
    };
    const email = renderCiFailureReport(report({ coverage }));
    expect(email.text).toContain('Lines     : 96.4% (covered 964 of 1000)');
    expect(email.text).toContain('Branches  : 85.6% (covered 856 of 1000)');
    expect(email.html).toContain('Coverage (merged test matrix)');
    expect(email.html).toContain('964 / 1000');

    const without = renderCiFailureReport(report());
    expect(without.text).not.toContain('Coverage');
    expect(without.html).not.toContain('Coverage');
  });
});
