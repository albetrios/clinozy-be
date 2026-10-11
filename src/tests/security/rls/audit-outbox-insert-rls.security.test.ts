import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  MAINTENANCE_SCOPE,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { sql as drizzleSql } from 'drizzle-orm';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import {
  grantClinozyBeAppRoleForTests,
  executeAsClinozyBeAppTenant,
} from '@/tests/helpers/rls-matrix.helper.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { DATABASE_APP_ROLE } from '@/shared/constants/project-identity.constants.js';
import { database } from '@/infrastructure/database/connection.js';

/** Rows of a `database.execute()` result. */
function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : ((result as { rows?: T[] }).rows ?? []);
}

/**
 * Regression for audit R10.
 *
 * `audit.outbox` is the request-time staging table for the audit ledger. Its INSERT policy
 * (`audit_outbox_tenant_isolation_insert`) only passes when the row's `organization_public_id`
 * matches `app.current_organization_public_id` (organization-scoped rows) OR `organization_public_id IS NULL` AND
 * `app.system_audit_insert = 'true'` (tenantless rows). There is NO user arm.
 *
 * Post-sec-M4 the per-request organization RLS transaction is a no-op, and HTTP controllers emit audit AFTER
 * the service's `withAppDatabaseContext` block has already closed — so `AuditService.record`
 * used to call `insertAuditOutboxRow` on the bare pool with NO GUC set. Under the production
 * `clinozy_be_app` role (FORCE/ENABLE RLS, NOBYPASSRLS) the WITH CHECK rejected EVERY such INSERT, and
 * `recordAuditEvent` swallowed the error — so the production audit trail was silently dropped. The
 * harness never caught it because tests run as the Compose superuser, which bypasses RLS.
 *
 * The fix opens the matching context inside `AuditService.record`: organization rows under
 * `withAppDatabaseContext`, tenantless rows under `withMaintenanceDatabaseContext`. These
 * tests prove the policy behavior under the production roles: `SET LOCAL ROLE clinozy_be_app`
 * for request paths, `clinozy_be_maintenance` for the system-audit-insert context.
 */

/** Minimal valid outbox row (satisfies chk_audit_outbox_actor_present + status/severity checks). */
function outboxInsertSql(organizationPublicId: string | null) {
  const actor = generatePublicId('user');
  return drizzleSql`
    INSERT INTO audit.outbox
      (status, actor_user_public_id, organization_public_id, action, resource_type, severity, metadata)
    VALUES
      ('PENDING', ${actor}, ${organizationPublicId}, 'test.r10.outbox', 'test', 'INFO', '{}'::jsonb)
  `;
}

/** Flattens an error and its `.cause` chain so the postgres SQLSTATE is matchable. */
function flattenErrorChain(error: unknown): string {
  let text = '';
  let current: unknown = error;
  for (let depth = 0; depth < 10 && current; depth += 1) {
    text += String(current);
    current = (current as { cause?: unknown }).cause;
  }
  return text;
}

describe('Security: audit.outbox INSERT RLS (audit R10)', () => {
  beforeAll(async () => {
    await grantClinozyBeAppRoleForTests();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('R10 BUG: plain clinozy_be_app (no GUC) CANNOT INSERT an organization-scoped outbox row', async () => {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });

    let caught: unknown;
    try {
      await database.transaction(async (transaction) => {
        await transaction.execute(
          drizzleSql`SET LOCAL ROLE ${drizzleSql.identifier(DATABASE_APP_ROLE)}`,
        );
        await transaction.execute(drizzleSql`
          INSERT INTO audit.outbox
            (status, actor_user_public_id, organization_public_id, action, resource_type, severity, metadata)
          VALUES ('PENDING', ${generatePublicId('user')}, ${organization.public_id}, 'test.r10.outbox', 'test', 'INFO', '{}'::jsonb)
        `);
      });
    } catch (error) {
      caught = error;
    }

    expect(
      caught,
      'org-scoped outbox INSERT without the tenant GUC must be rejected',
    ).toBeDefined();
    expect(flattenErrorChain(caught)).toMatch(/row-level security|permission denied/i);
  });

  it('R10 BUG: plain clinozy_be_app (no GUC) CANNOT INSERT a tenantless outbox row', async () => {
    let caught: unknown;
    try {
      await database.transaction(async (transaction) => {
        await transaction.execute(
          drizzleSql`SET LOCAL ROLE ${drizzleSql.identifier(DATABASE_APP_ROLE)}`,
        );
        await transaction.execute(drizzleSql`
          INSERT INTO audit.outbox
            (status, actor_user_public_id, organization_public_id, action, resource_type, severity, metadata)
          VALUES ('PENDING', ${generatePublicId('user')}, ${null}, 'test.r10.outbox', 'test', 'INFO', '{}'::jsonb)
        `);
      });
    } catch (error) {
      caught = error;
    }

    expect(
      caught,
      'tenantless outbox INSERT without app.system_audit_insert must be rejected',
    ).toBeDefined();
    expect(flattenErrorChain(caught)).toMatch(/row-level security|permission denied/i);
  });

  it('R10 FIX: clinozy_be_app under organization context CAN INSERT the organization-scoped outbox row', async () => {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });

    await executeAsClinozyBeAppTenant(organization.public_id, (transaction) =>
      transaction.execute(outboxInsertSql(organization.public_id)),
    );

    const rows = rowsOf<{ count: string }>(
      await database.execute(drizzleSql`
      SELECT COUNT(*)::text AS count FROM audit.outbox
      WHERE action = 'test.r10.outbox' AND organization_public_id = ${organization.public_id}
    `),
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('R10 FIX: the system-audit-insert context (clinozy_be_maintenance) CAN INSERT the tenantless outbox row', async () => {
    let caught: unknown;
    try {
      await withMaintenanceDatabaseContext({
        scope: MAINTENANCE_SCOPE.SYSTEM_AUDIT_INSERT,
        callback: (databaseHandle) => databaseHandle.execute(outboxInsertSql(null)),
        options: { useMaintenanceDatabaseRole: true },
      });
    } catch (error) {
      caught = error;
    }

    expect(
      caught,
      'tenantless INSERT under withMaintenanceDatabaseContext must succeed',
    ).toBeUndefined();
    const rows = rowsOf<{ count: string }>(
      await database.execute(drizzleSql`
      SELECT COUNT(*)::text AS count FROM audit.outbox
      WHERE action = 'test.r10.outbox' AND organization_public_id IS NULL
    `),
    );
    expect(rows[0]?.count).toBe('1');
  });
});
