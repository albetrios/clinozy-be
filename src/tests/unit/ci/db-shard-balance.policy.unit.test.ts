import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const projects = readFileSync('tooling/vitest/projects.ts', 'utf8');
const integrationWorkflow = readFileSync(
  '.github/workflows/reusable-vitest-postgres-redis.yml',
  'utf8',
);
const prCi = readFileSync('.github/workflows/pr-ci.yml', 'utf8');
const rlsParity = readFileSync('.github/workflows/scheduled-rls-parity.yml', 'utf8');

/** The domains `VITEST_DOMAIN_FILTER` knows, read from tooling/vitest/projects.ts, plus `rest`. */
const domainTokens = [
  ...[
    ...(projects.match(/const ALL_DOMAIN_NAMES = \[([\s\S]*?)\] as const;/)?.[1] ?? '').matchAll(
      /'(\w+)'/g,
    ),
  ].map((match) => match[1] as string),
  'rest',
];

interface DatabaseShard {
  id: string;
  projects: string;
  domain_filter: string;
  security_slice: string;
}

const databaseShards = JSON.parse(
  integrationWorkflow.match(/shards_compact='(\[.*\])'/)?.[1] ?? '[]',
) as DatabaseShard[];

const tokens = (filter: string) => filter.split(',').filter((token) => token.length > 0);

/**
 * Locks in the duration-balanced DB shards: whatever the grouping, every test file still runs
 * exactly once — the test count and coverage cannot drop by a regrouping.
 */
describe('DB test shards', () => {
  it('the domain list was read', () => {
    expect(domainTokens).toEqual(expect.arrayContaining(['auth', 'tenancy', 'app', 'rest']));
  });

  it('the e2e + integration shards cover every domain and rest exactly once', () => {
    const covered = databaseShards
      .filter((shard) => shard.projects.includes('--project e2e'))
      .flatMap((shard) => tokens(shard.domain_filter));
    expect([...covered].sort()).toEqual([...domainTokens].sort());
  });

  it('the security project runs once as the matrix slice and once as the rest', () => {
    const slices = databaseShards
      .filter((shard) => shard.projects.includes('--project security'))
      .map((shard) => shard.security_slice)
      .sort();
    expect(slices).toEqual(['matrix', 'rest']);
  });

  it('unit-db and performance run in exactly one shard each, and no shard splits by file count', () => {
    for (const project of ['--project unit-db', '--project performance']) {
      expect(databaseShards.filter((shard) => shard.projects.includes(project))).toHaveLength(1);
    }
    expect(databaseShards.every((shard) => !shard.projects.includes('--shard'))).toBe(true);
    expect(databaseShards.every((shard) => shard.id.startsWith('db-'))).toBe(true);
  });

  it('the application-role lane covers every domain and rest exactly once', () => {
    const job = prCi.slice(
      prCi.indexOf('\n  rls-application-role:'),
      prCi.indexOf('\n  build-verify:'),
    );
    const covered = [...job.matchAll(/^ {12}domains: ([\w,]+)$/gm)].flatMap((match) =>
      tokens(match[1] as string),
    );
    expect([...covered].sort()).toEqual([...domainTokens].sort());
    expect(job).toContain(`VITEST_DOMAIN_FILTER: \${{ matrix.domains }}`);
    expect(job).not.toContain('--shard=');
  });

  it('the nightly RLS parity canary runs every suite once, in parallel jobs', () => {
    const groups = [...rlsParity.matchAll(/^ {10}- group: ([\w-]+)\n((?: {12}.+\n)+)/gm)].map(
      (match) => match[2] as string,
    );
    const field = (group: string, key: string) =>
      // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp — test helper: key is a literal field name of the workflow
      group.match(new RegExp(`^ {12}${key}: (.+)$`, 'm'))?.[1] ?? '';
    const covered = groups
      .filter((group) => field(group, 'suite') === 'e2e-integration')
      .flatMap((group) => tokens(field(group, 'domains')));
    expect([...covered].sort()).toEqual([...domainTokens].sort());
    const slices = groups
      .filter((group) => field(group, 'suite') === 'security')
      .map((group) => field(group, 'security_slice'))
      .sort();
    expect(slices).toEqual(['matrix', 'rest']);
    expect(groups.filter((group) => field(group, 'suite') === 'unit-db')).toHaveLength(1);
    expect(rlsParity).toContain(`VITEST_DOMAIN_FILTER: \${{ matrix.domains }}`);
    expect(rlsParity).toContain(`VITEST_SECURITY_SLICE: \${{ matrix.security_slice }}`);
    expect(rlsParity).toMatch(/^ {6}fail-fast: false$/m);
  });

  it('every DB lane turns off Postgres durability before it migrates', () => {
    for (const workflow of [integrationWorkflow, prCi, rlsParity]) {
      // `pnpm db:migrate` itself, not `pnpm db:migrate:lint` (a static check, no database).
      const migrations = workflow.match(/pnpm db:migrate$/gm)?.length ?? 0;
      expect(migrations).toBeGreaterThan(0);
      const tuned = workflow.split('uses: ./.github/actions/tune-ci-postgres').length - 1;
      expect(tuned).toBe(migrations);
    }
  });
});
