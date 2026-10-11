import { describe, expect, it } from 'vitest';
import { lintMigrationFileContent } from '@/scripts/validators/migration/lint-migrations.js';

/**
 * The migrator is RLS-subject: `clinozy_be_migrator` is a member of `clinozy_be_owner`, and FORCE ROW
 * LEVEL SECURITY binds table owners. A data migration that WRITES a FORCE RLS table is rejected;
 * one that READS from one is handed zero rows and succeeds having done nothing. Hosted
 * migrations run as a `clinozy_be_migrator` login that also holds BYPASSRLS, so both pass there
 * and fail only where the migrator is RLS-subject.
 *
 * The cases below are both failure modes in miniature: a write rejected outright, and a write
 * whose FORCE RLS source is not lifted — it reports success while moving nothing.
 */

const AFTER_TAXONOMY = '29990101000000_backfill.sql';

const BACKFILL_BODY = `INSERT INTO tenancy.permissions (code, name, category)
VALUES ('webhook:read', 'View Webhooks', 'notify')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO tenancy.role_permissions (role_id, permission_code, created_by_user_id)
SELECT r.id, 'webhook:read', o.owner_user_id
FROM tenancy.roles r
INNER JOIN tenancy.organizations o ON o.id = r.organization_id
ON CONFLICT (role_id, permission_code) DO NOTHING;`;

function bracket(tables: readonly string[], body: string): string {
  const lift = tables.map((table) => `ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY;`);
  const reapply = tables.map((table) => `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
  return [...lift, body, ...reapply].join('\n--> statement-breakpoint\n');
}

function flaggedTables(filename: string, sql: string): string[] {
  return lintMigrationFileContent({ filename, fileContent: sql })
    .violations.filter(
      (violation) => violation.ruleId === 'force_rls_data_migration_without_owner_bracket',
    )
    .map((violation) => violation.message.split(':')[0] ?? '')
    .sort();
}

describe('lint-migrations: force_rls_data_migration_without_owner_bracket', () => {
  it('flags a backfill that leaves the FORCE RLS tables it writes or reads in force', () => {
    expect(flaggedTables(AFTER_TAXONOMY, BACKFILL_BODY)).toEqual([
      'tenancy.organizations',
      'tenancy.permissions',
      'tenancy.role_permissions',
      'tenancy.roles',
    ]);
  });

  it('flags a bracket that covers only the tables WRITTEN — the silent zero-row fix', () => {
    const writeSideOnly = bracket(
      ['tenancy.permissions', 'tenancy.role_permissions'],
      BACKFILL_BODY,
    );

    // The INSERT would run, SELECT zero source rows through RLS, and report success having
    // granted nothing — worse than the loud rejection it replaced.
    expect(flaggedTables(AFTER_TAXONOMY, writeSideOnly)).toEqual([
      'tenancy.organizations',
      'tenancy.roles',
    ]);
  });

  it('passes once every FORCE RLS table the file touches is lifted and re-applied', () => {
    const fullBracket = bracket(
      ['tenancy.permissions', 'tenancy.role_permissions', 'tenancy.roles', 'tenancy.organizations'],
      BACKFILL_BODY,
    );
    expect(flaggedTables(AFTER_TAXONOMY, fullBracket)).toEqual([]);
  });

  it('flags a table that is lifted but never re-forced', () => {
    const liftedOnly = [
      'ALTER TABLE tenancy.permissions NO FORCE ROW LEVEL SECURITY;',
      "INSERT INTO tenancy.permissions (code, name, category) VALUES ('a:b', 'A', 'a');",
    ].join('\n--> statement-breakpoint\n');

    // Leaving FORCE off would keep the owner exempt from RLS on that table permanently.
    expect(flaggedTables(AFTER_TAXONOMY, liftedOnly)).toEqual(['tenancy.permissions']);
  });

  it('ignores DDL-only migrations, including ones that change FORCE RLS policies', () => {
    const policyOnly = `DROP POLICY IF EXISTS permissions_deny_all ON tenancy.permissions;
--> statement-breakpoint
CREATE POLICY permissions_deny_all ON tenancy.permissions AS PERMISSIVE FOR ALL TO PUBLIC USING (false);`;
    expect(flaggedTables(AFTER_TAXONOMY, policyOnly)).toEqual([]);
  });

  it('ignores DDL that says UPDATE but moves no rows — a FOR UPDATE policy, an ON UPDATE FK', () => {
    const policy = `CREATE POLICY organizations_update ON tenancy.organizations FOR UPDATE TO clinozy_be_app USING (true);`;
    const foreignKey = `CREATE TABLE IF NOT EXISTS notify.example (
  id bigint PRIMARY KEY,
  organization_id bigint REFERENCES tenancy.organizations (id) ON UPDATE CASCADE ON DELETE SET NULL
);`;
    expect(flaggedTables(AFTER_TAXONOMY, policy)).toEqual([]);
    expect(flaggedTables(AFTER_TAXONOMY, foreignKey)).toEqual([]);
  });

  it('still flags a real UPDATE, with ONLY or an alias', () => {
    expect(
      flaggedTables(AFTER_TAXONOMY, 'UPDATE ONLY tenancy.roles SET is_system = true WHERE id = 1;'),
    ).toEqual(['tenancy.roles']);
    expect(
      flaggedTables(
        AFTER_TAXONOMY,
        'UPDATE tenancy.organizations AS o SET name = o.name WHERE o.id = 1;',
      ),
    ).toEqual(['tenancy.organizations']);
  });

  it('does not count a table named only in a comment', () => {
    const commentOnly = `-- Backfills rows that tenancy.roles used to hold.
INSERT INTO notify.webhook_event_catalog (event) VALUES ('x.y');`;
    expect(flaggedTables(AFTER_TAXONOMY, commentOnly)).toEqual([]);
  });
});
