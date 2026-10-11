import { beforeEach, describe, expect, it } from 'vitest';
import { type SQL, sql as drizzleSql } from 'drizzle-orm';
import { database } from '@/infrastructure/database/connection.js';
import {
  type RequestScopedPostgresDatabase,
  setLocalApplicationRole,
  setLocalDatabaseConfig,
  setLocalMaintenanceRole,
} from '@/infrastructure/database/contexts/database-context-runtime.js';
import type { MaintenanceBypassGuc } from '@/infrastructure/database/pg-schemas.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestWebhook } from '@/tests/factories/webhook.factory.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';

/**
 * Every RLS bypass arm is bound to the maintenance role (migration
 * `20261005170000_bind_bypass_arms_to_maintenance_role.sql`): the `app.*` GUC only selects an arm,
 * and the arm opens only while `current_user` is `clinozy_be_maintenance` — the role
 * `DATABASE_MAINTENANCE_URL` connects as.
 *
 * Each case arms one bypass GUC with no tenant or user identity set, then probes the table it
 * guards twice: as `clinozy_be_app` (the runtime role — a compromised request connection) the
 * arm must open nothing, and as `clinozy_be_maintenance` (the positive control) it must open.
 * Rows are seeded by the harness role, which RLS exempts; every suite starts from a truncated
 * database.
 */

type RoleSwitch = (databaseHandle: RequestScopedPostgresDatabase) => Promise<void>;

const AS_APPLICATION_ROLE: RoleSwitch = setLocalApplicationRole;
const AS_MAINTENANCE_ROLE: RoleSwitch = setLocalMaintenanceRole;

/** Runs `statement` in its own transaction with `guc` armed under `role`; returns the rows it reports. */
async function probeWithBypassGuc(options: {
  role: RoleSwitch;
  guc: MaintenanceBypassGuc;
  statement: SQL;
}): Promise<number> {
  return database.transaction(async (transaction) => {
    const databaseHandle = transaction as unknown as RequestScopedPostgresDatabase;
    await options.role(databaseHandle);
    await setLocalDatabaseConfig({ databaseHandle, key: options.guc, value: 'true' });
    const result = await databaseHandle.execute(options.statement);
    const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
    return rows.length;
  });
}

/** Flattens an error and its `.cause` chain so the postgres message is matchable. */
function flattenErrorChain(error: unknown): string {
  let text = '';
  let current: unknown = error;
  for (let depth = 0; depth < 10 && current; depth += 1) {
    text += String(current);
    current = (current as { cause?: unknown }).cause;
  }
  return text;
}

describe('Security: RLS bypass arms are bound to the maintenance role', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  it.each([
    {
      guc: 'app.global_retention_cleanup' as const,
      table: 'notify.webhooks',
      statement: drizzleSql`SELECT id FROM notify.webhooks`,
    },
    {
      guc: 'app.global_admin' as const,
      table: 'auth.users',
      statement: drizzleSql`SELECT id FROM auth.users`,
    },
    {
      guc: 'app.session_retention_cleanup' as const,
      table: 'auth.sessions',
      statement: drizzleSql`SELECT id FROM auth.sessions`,
    },
    {
      guc: 'app.audit_outbox_drain' as const,
      table: 'audit.outbox',
      statement: drizzleSql`SELECT id FROM audit.outbox`,
    },
  ])('$guc reads $table only as the maintenance role', async ({ guc, statement }) => {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    await createTestWebhook({ organizationId: organization.id });
    await database.execute(drizzleSql`
      INSERT INTO auth.sessions (public_id, user_id, token_hash, ip_address, user_agent, expires_at)
      VALUES (${generatePublicId('authSession')}, ${owner.id}, 'bypass-binding-hash', '127.0.0.1',
              'vitest', now() + interval '1 day')
    `);
    await database.execute(drizzleSql`
      INSERT INTO audit.outbox
        (status, actor_user_public_id, organization_public_id, action, resource_type, severity, metadata)
      VALUES ('PENDING', ${owner.public_id}, NULL, 'test.bypass_binding', 'test', 'INFO', '{}'::jsonb)
    `);

    expect(await probeWithBypassGuc({ role: AS_APPLICATION_ROLE, guc, statement })).toBe(0);
    expect(await probeWithBypassGuc({ role: AS_MAINTENANCE_ROLE, guc, statement })).toBeGreaterThan(
      0,
    );
  });

  it('app.system_audit_insert admits a tenantless audit row only as the maintenance role', async () => {
    // No RETURNING: it would also need the row SELECT-visible, and the system-audit arm is
    // INSERT-only. The harness role counts the rows afterwards instead.
    const insertTenantlessAuditRow = () => drizzleSql`
      INSERT INTO audit.logs (public_id, organization_id, actor_user_id, action, resource_type, metadata, severity)
      VALUES (${generatePublicId('auditLog')}, NULL, NULL, 'test.bypass_binding', 'test', '{}'::jsonb, 'INFO')
    `;
    const countTenantlessAuditRows = async () => {
      const result = await database.execute(
        drizzleSql`SELECT id FROM audit.logs WHERE action = 'test.bypass_binding'`,
      );
      return (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []))
        .length;
    };

    let caught: unknown;
    try {
      await probeWithBypassGuc({
        role: AS_APPLICATION_ROLE,
        guc: 'app.system_audit_insert',
        statement: insertTenantlessAuditRow(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught, 'the runtime role must not open the system-audit arm').toBeDefined();
    expect(flattenErrorChain(caught)).toMatch(/row-level security/i);
    expect(await countTenantlessAuditRows()).toBe(0);

    await probeWithBypassGuc({
      role: AS_MAINTENANCE_ROLE,
      guc: 'app.system_audit_insert',
      statement: insertTenantlessAuditRow(),
    });
    expect(await countTenantlessAuditRows()).toBe(1);
  });
});
