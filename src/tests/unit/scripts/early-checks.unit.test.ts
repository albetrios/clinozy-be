import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EARLY_CHECKS_BLOCK_FROM,
  isEarlyCheckWarnOnly,
  reportEarlyCheck,
} from '@/scripts/tooling/early-checks.util.js';
import { pushSemgrepTargets } from '@/scripts/tooling/run-push-semgrep.js';
import {
  buildRlsState,
  lintRlsTables,
  touchedTables,
} from '@/scripts/validators/migration/lint-rls-policies.js';
import { diffRouteAccess } from '@/scripts/validators/routes/validate-route-access-diff.js';

afterEach(() => {
  vi.restoreAllMocks();
});

/** The last second of 30 Oct and the first of 31 Oct, Asia/Calcutta (UTC+5:30). */
const LAST_WARN_ONLY_MOMENT = new Date('2026-10-30T18:29:59Z');
const FIRST_BLOCKING_MOMENT = new Date('2026-10-30T18:30:00Z');

describe('early checks — the warn-only window', () => {
  it('warns until the block date in Asia/Calcutta, then blocks', () => {
    expect(EARLY_CHECKS_BLOCK_FROM).toBe('2026-10-31');
    expect(isEarlyCheckWarnOnly(LAST_WARN_ONLY_MOMENT)).toBe(true);
    expect(isEarlyCheckWarnOnly(FIRST_BLOCKING_MOMENT)).toBe(false);
  });

  it('passes with no finding, warns while warn-only, fails once it blocks', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(reportEarlyCheck({ check: 'x', findings: [], now: FIRST_BLOCKING_MOMENT })).toBe(0);
    expect(reportEarlyCheck({ check: 'x', findings: ['f'], now: LAST_WARN_ONLY_MOMENT })).toBe(0);
    expect(reportEarlyCheck({ check: 'x', findings: ['f'], now: FIRST_BLOCKING_MOMENT })).toBe(1);
    expect(error.mock.calls.flat().join('\n')).toContain('warn-only-false-positives.md');
  });
});

const TENANT_USING =
  "USING (organization_id = current_setting('app.current_organization_public_id'))";
const TENANT_CHECK =
  "WITH CHECK (organization_id = current_setting('app.current_organization_public_id'))";

function migration(name: string, ...statements: string[]) {
  return { name, content: statements.join(';\n') };
}

const MIGRATIONS = [
  migration(
    '0001_init.sql',
    'CREATE TABLE IF NOT EXISTS "app"."leads" ("id" bigserial, "organization_id" bigint NOT NULL)',
    'ALTER TABLE "app"."leads" ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE "app"."leads" FORCE ROW LEVEL SECURITY',
    `CREATE POLICY "leads_tenant_isolation" ON "app"."leads" AS PERMISSIVE FOR ALL TO public ${TENANT_USING} ${TENANT_CHECK}`,
    'CREATE TABLE app.notes (id bigserial, organization_id bigint)',
    'ALTER TABLE app.notes ENABLE ROW LEVEL SECURITY',
    `CREATE POLICY notes_tenant ON app.notes FOR ALL ${TENANT_USING}`,
    'CREATE TABLE app.owned (id bigserial, organization_id bigint, user_id bigint)',
    'ALTER TABLE app.owned ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE app.owned FORCE ROW LEVEL SECURITY',
    "CREATE POLICY owned_by_user ON app.owned FOR ALL USING (user_id = current_setting('app.current_user_id'))",
    'CREATE TABLE app.leads_archive PARTITION OF app.leads FOR VALUES IN (1)',
  ),
  migration(
    '0002_change.sql',
    'ALTER TABLE app.notes FORCE ROW LEVEL SECURITY',
    `ALTER POLICY notes_tenant ON app.notes ${TENANT_CHECK}`,
    'ALTER TABLE app.owned NO FORCE ROW LEVEL SECURITY',
    '-- a comment; CREATE TABLE app.ghost (id int)',
    "DO $$ BEGIN EXECUTE 'CREATE POLICY hidden ON app.leads FOR ALL USING (true)'; END $$",
  ),
];

describe('RLS policy lint', () => {
  const { tables, touchedBy } = buildRlsState(MIGRATIONS);

  it('replays the migrations into each table’s final state', () => {
    expect(tables.get('app.leads')).toMatchObject({
      isEnabled: true,
      isForced: true,
      isOrganizationScoped: true,
    });
    expect(tables.get('app.notes')?.policies).toEqual([
      { name: 'notes_tenant', command: 'all', isTenantPolicy: true, hasWithCheck: true },
    ]);
    expect(tables.get('app.owned')?.isForced).toBe(false);
    expect(tables.has('app.ghost')).toBe(false);
    expect(tables.get('app.leads')?.policies.map((policy) => policy.name)).toEqual([
      'leads_tenant_isolation',
    ]);
    expect([...(touchedBy.get('0002_change.sql') ?? [])].sort()).toEqual([
      'app.notes',
      'app.owned',
    ]);
  });

  it('flags a table without FORCE and a tenant write policy without WITH CHECK, not a user policy', () => {
    const before = buildRlsState(MIGRATIONS.slice(0, 1)).tables;
    expect(
      lintRlsTables({ state: before, tables: ['app.notes', 'app.owned', 'app.leads_archive'] }),
    ).toEqual([
      'app.notes: no FORCE ROW LEVEL SECURITY',
      'app.notes: tenant policy notes_tenant (FOR ALL) has no WITH CHECK',
    ]);
    expect(
      lintRlsTables({ state: tables, tables: ['app.leads', 'app.notes', 'app.owned'] }),
    ).toEqual(['app.owned: no FORCE ROW LEVEL SECURITY']);
  });

  it('checks the tables a changed migration touches and a changed schema declares', () => {
    const files: Record<string, string> = {
      'src/infrastructure/database/pg-schemas.ts': "export const appSchema = pgSchema('app');",
      'src/domains/app/x.schema.ts': "export const x = appSchema.table('drafts', {});",
    };
    const touched = touchedTables({
      changedFiles: ['migrations/0002_change.sql', 'src/domains/app/x.schema.ts', 'docs/x.md'],
      touchedBy,
      readFile: (path) => files[path] ?? '',
    });
    expect(touched.sort()).toEqual(['app.drafts', 'app.notes', 'app.owned']);
    expect(lintRlsTables({ state: tables, tables: ['app.drafts'] })).toEqual([
      'app.drafts: declared or changed, but no migration creates it',
    ]);
  });
});

function catalog(...rows: string[]): string {
  return rows.map((row) => `  ${row}`).join('\n');
}

describe('route access diff', () => {
  it('lists every change and flags the ones that widen access', () => {
    const before = catalog(
      'GET    /api/v1/app/leads              200  -    both  PERM: lead:read',
      'POST   /api/v1/app/leads              200  req  team  PERM: lead:create',
      'DELETE /api/v1/app/leads/:lead_id     204  -    both  PERM: lead:delete',
      'GET    /api/v1/me                     200  -    both  AUTH',
      'GET    /api/v1/app/notes              200  -    both  AUTH',
    );
    const after = catalog(
      'GET    /api/v1/app/leads              200  -    both  AUTH',
      'POST   /api/v1/app/leads              200  -    both  PERM: lead:write',
      'GET    /api/v1/me                     200  -    both  AUTH',
      'GET    /api/v1/app/notes              200  -    both  PERM: note:read',
      'GET    /api/v1/status                 200  -    both  PUBLIC',
    );
    const { changes, findings } = diffRouteAccess({ before, after });
    expect(findings).toEqual([
      'GET /app/leads: weaker gate (PERM: lead:read → AUTH)',
      'POST /app/leads: permission changed (PERM: lead:create → PERM: lead:write)',
      'POST /app/leads: team-only → both (personal accounts may call it now)',
      'POST /app/leads: no longer requires X-Idempotency-Key',
      'GET /status: new route without a JWT (PUBLIC)',
    ]);
    expect(changes).toContain(
      '~ GET /app/notes — AUTH · both · no idempotency → PERM: note:read · both · no idempotency',
    );
    expect(changes).toContain(
      '- DELETE /app/leads/:lead_id — PERM: lead:delete · both · no idempotency',
    );
    expect(changes).toHaveLength(5);
  });

  it('finds nothing when the catalog is unchanged', () => {
    const same = catalog('GET    /api/v1/me    200  -    both  AUTH');
    expect(diffRouteAccess({ before: same, after: same })).toEqual({ changes: [], findings: [] });
  });
});

describe('Semgrep at push', () => {
  it('scans auth, tenancy, billing and the database contexts, never their tests', () => {
    expect(
      pushSemgrepTargets([
        'src/domains/auth/auth.service.ts',
        'src/domains/tenancy/sub-domains/membership/membership.service.ts',
        'src/domains/billing/billing.container.ts',
        'src/infrastructure/database/contexts/database-context.ts',
        'src/domains/auth/__tests__/unit/auth.service.unit.test.ts',
        'src/domains/app/sub-domains/leads/leads.service.ts',
        'docs/reference/commands.md',
      ]),
    ).toEqual([
      'src/domains/auth/auth.service.ts',
      'src/domains/tenancy/sub-domains/membership/membership.service.ts',
      'src/domains/billing/billing.container.ts',
      'src/infrastructure/database/contexts/database-context.ts',
    ]);
  });
});
