import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_REPOSITORY, PROJECT_SLUG } from '@/shared/constants/project-identity.constants.js';
import { beforeAll, describe, expect, it } from 'vitest';

interface Route {
  globs?: string[];
  skills?: string[];
}

interface FixPlanJob {
  name: string;
  steps: string[];
  tail: string[];
}

/** The exports of `.github/actions/ci-failure-issue/fix-plan.mjs` (plain Node, no types). */
interface FixPlanModule {
  LOG_TAIL_LINES: number;
  failedJobs(run: unknown): Array<{ id: number; name: string; steps: string[] }>;
  logTail(text: string, lines?: number): string[];
  namedPaths(lines: readonly string[]): string[];
  owningArea(path: string): string;
  globToRegExp(glob: string): RegExp;
  skillsFor(options: { paths: readonly string[]; routes: readonly Route[] }): string[];
  renderFixPlan(options: {
    repository: string;
    jobs: FixPlanJob[];
    routes: readonly Route[];
  }): string;
}

const FIX_PLAN = join(process.cwd(), '.github', 'actions', 'ci-failure-issue', 'fix-plan.mjs');
const ESCAPE = String.fromCodePoint(27);

let fixPlan: FixPlanModule;

beforeAll(async () => {
  fixPlan = (await import(pathToFileURL(FIX_PLAN).href)) as FixPlanModule;
});

/**
 * The fix plan a ci-failure issue carries (task 38): the failed jobs and steps, the log tail up to
 * the last error, the owning area and the skills the routing map names for the files in the log.
 */
describe('ci-failure fix plan', () => {
  it('keeps the failed jobs and their failed steps, not the running notify job', () => {
    const jobs = fixPlan.failedJobs({
      jobs: [
        {
          id: 1,
          name: 'Unit tests',
          conclusion: 'failure',
          steps: [
            { name: 'Checkout', conclusion: 'success' },
            { name: 'Run unit tests', conclusion: 'failure' },
          ],
        },
        { id: 2, name: 'RLS parity', conclusion: 'cancelled', steps: [] },
        { id: 3, name: 'Lint', conclusion: 'success', steps: [] },
        { id: 4, name: 'Notify failure', conclusion: null },
      ],
    });
    expect(jobs).toEqual([
      { id: 1, name: 'Unit tests', steps: ['Run unit tests'] },
      { id: 2, name: 'RLS parity', steps: [] },
    ]);
  });

  it('cuts the log at its last error, without timestamps, colors or group ends', () => {
    const log = [
      '2026-10-18T01:00:00.0000000Z ##[group]Run pnpm test:unit',
      `2026-10-18T01:00:01.0000000Z ${ESCAPE}[31m FAIL ${ESCAPE}[39m src/a.unit.test.ts`,
      '2026-10-18T01:00:01.5000000Z ##[endgroup]',
      '2026-10-18T01:00:02.0000000Z ##[error]Process completed with exit code 1.',
      '2026-10-18T01:00:03.0000000Z Post job cleanup.',
    ].join('\n');
    expect(fixPlan.logTail(log)).toEqual([
      '##[group]Run pnpm test:unit',
      ' FAIL  src/a.unit.test.ts',
      '##[error]Process completed with exit code 1.',
    ]);
    expect(fixPlan.logTail('one\ntwo\nthree', 2)).toEqual(['two', 'three']);
    expect(fixPlan.LOG_TAIL_LINES).toBe(40);
  });

  it('names the repository paths in a log, most named first, workspace prefix removed', () => {
    const paths = fixPlan.namedPaths([
      ' FAIL  src/domains/billing/a.unit.test.ts > rejects',
      `  at /home/runner/work/${PROJECT_SLUG}/${PROJECT_SLUG}/src/shared/b.util.ts:12:3`,
      'see src/shared/b.util.ts.',
      'nothing here',
    ]);
    expect(paths).toEqual(['src/shared/b.util.ts', 'src/domains/billing/a.unit.test.ts']);
  });

  it('owns a path by its sub-domain, its domain, its page, or its top folders', () => {
    expect(
      fixPlan.owningArea('src/domains/billing/sub-domains/billing-plan/billing-plan.service.ts'),
    ).toBe('src/domains/billing/sub-domains/billing-plan');
    expect(fixPlan.owningArea('src/domains/audit/audit.container.ts')).toBe('src/domains/audit');
    expect(fixPlan.owningArea('src/pages/login/LoginPage.tsx')).toBe('src/pages/login');
    expect(fixPlan.owningArea('tooling/ci/early-failure-alert.mjs')).toBe('tooling/ci');
    expect(fixPlan.owningArea('migrations/0001_init.sql')).toBe('migrations');
  });

  it('matches routing-map globs over whole paths', () => {
    const glob = fixPlan.globToRegExp('src/domains/**/*.routes.ts');
    expect(glob.test('src/domains/billing/billing.routes.ts')).toBe(true);
    expect(glob.test('src/domains/billing/sub-domains/x/x.routes.ts')).toBe(true);
    expect(glob.test('src/domains/billing/billing.routes.tsx')).toBe(false);
    expect(fixPlan.globToRegExp('src/?.ts').test('src/a.ts')).toBe(true);
    expect(fixPlan.globToRegExp('src/*.ts').test('src/a/b.ts')).toBe(false);
    expect(fixPlan.globToRegExp('docs/**').test('docs/a/b.md')).toBe(true);
  });

  it('lists the skills of every matching route once, in route order', () => {
    const routes: Route[] = [
      {
        globs: ['src/domains/**/*.routes.ts'],
        skills: ['be-api-contract-guard', 'be-route-catalog'],
      },
      { globs: ['migrations/*.sql'], skills: ['be-migration-guard'] },
      { globs: ['src/domains/**'], skills: ['be-route-catalog', 'be-test-generator'] },
    ];
    expect(fixPlan.skillsFor({ paths: ['src/domains/billing/billing.routes.ts'], routes })).toEqual(
      ['be-api-contract-guard', 'be-route-catalog', 'be-test-generator'],
    );
    expect(fixPlan.skillsFor({ paths: ['README.md'], routes })).toEqual([]);
  });

  it('renders one section per failed job and names the investigator to start', () => {
    const plan = fixPlan.renderFixPlan({
      repository: PROJECT_REPOSITORY,
      jobs: [
        {
          name: 'Unit tests',
          steps: ['Run unit tests'],
          tail: [' FAIL  src/domains/audit/audit.unit.test.ts', 'a ``` fence'],
        },
        { name: 'RLS parity', steps: [], tail: [] },
      ],
      routes: [{ globs: ['src/domains/**'], skills: ['be-test-generator'] }],
    });
    expect(plan).toContain('## Fix plan');
    expect(plan).toContain('### Unit tests › Run unit tests');
    expect(plan).toContain('- **Owning area:** `src/domains/audit`');
    expect(plan).toContain('- **Skill that fixes it:** `be-test-generator`');
    expect(plan).toContain("a ''' fence");
    expect(plan).toContain('### RLS parity\n\n- **Owning area:** not named in the log');
    expect(plan).toContain('none matched — start `be-ci-investigator` on this job');
    expect(plan).toContain('Diagnose with `be-ci-investigator`');
    expect(fixPlan.renderFixPlan({ repository: 'owner/storefront-fe', jobs: [], routes: [] })).toBe(
      '',
    );
    expect(
      fixPlan.renderFixPlan({
        repository: 'owner/storefront-fe',
        jobs: [{ name: 'Lint', steps: [], tail: [] }],
        routes: [],
      }),
    ).toContain('`fe-ci-investigator`');
  });

  it('lists five jobs and counts the rest', () => {
    const jobs = Array.from({ length: 7 }, (_, index) => ({
      name: `Job ${String.fromCodePoint(65 + index)}`,
      steps: [],
      tail: [],
    }));
    const plan = fixPlan.renderFixPlan({ repository: PROJECT_REPOSITORY, jobs, routes: [] });
    expect(plan.match(/^### /gm)).toHaveLength(5);
    expect(plan).toContain('…and 2 more failed job(s).');
  });
});
