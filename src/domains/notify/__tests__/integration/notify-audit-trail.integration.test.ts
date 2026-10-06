import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { audit_outbox } from '@/domains/audit/audit-outbox.schema.js';
import { runAuditOutboxDrainJob } from '@/domains/audit/workers/audit-outbox-drain.processor.js';
import { NOTIFY_PERMISSIONS } from '@/domains/notify/notify.permissions.js';
import {
  createMembership,
  createRoleWithPermissions,
  seedPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import {
  MAINTENANCE_SCOPE,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';

const WEBHOOK_PERMISSIONS = [NOTIFY_PERMISSIONS.WEBHOOK_READ, NOTIFY_PERMISSIONS.WEBHOOK_MANAGE];

/**
 * A webhook sends organization events to an outside URL — creating one is a classic exfiltration
 * step — yet webhook changes recorded nothing, although `docs/reference/security/audit-logs.md`
 * listed them. A new destination (create, or a URL change) is recorded at WARNING with the URL's
 * origin only: the path and query, which can carry a receiver's secret, never reach the log.
 */
describe('notify audit trail — webhook changes reach the audit log', () => {
  let application: FastifyInstance;

  beforeAll(async () => {
    const { app } = await createTestApp();
    application = app;
  });

  afterAll(async () => {
    await application.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    await seedPermissions(WEBHOOK_PERMISSIONS);
  });

  async function stagedRows(action: string) {
    return getOperatorDatabase().select().from(audit_outbox).where(eq(audit_outbox.action, action));
  }

  it('records a new destination at WARNING (origin only), other changes and deletion at INFO', async () => {
    const user = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: user.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: WEBHOOK_PERMISSIONS,
    });
    await createMembership({ userId: user.id, organizationId: organization.id, roleId: role.id });
    const token = await generateTestToken({
      userId: user.public_id,
      organizationPublicId: organization.public_id,
    });
    const send = (options: {
      method: 'POST' | 'PATCH' | 'DELETE';
      path: string;
      payload?: Record<string, unknown>;
    }) =>
      injectAuthenticated(application, {
        method: options.method,
        url: testApiPath(options.path),
        token,
        headers: { 'x-idempotency-key': `notify-audit-${randomUUID()}` },
        ...(options.payload ? { payload: options.payload } : {}),
      });

    const created = await send({
      method: 'POST',
      path: '/notify/webhooks',
      payload: {
        url: 'https://example.com/hooks/audit?receiver_secret=do-not-log',
        events: ['subscription.created'],
      },
    });
    expect(created.statusCode, created.body).toBe(200);
    const webhookId = (created.json() as { data: { id: string } }).data.id;
    const path = `/notify/webhooks/${webhookId}`;
    expect((await send({ method: 'PATCH', path, payload: { is_enabled: false } })).statusCode).toBe(
      200,
    );
    expect(
      (
        await send({
          method: 'PATCH',
          path,
          payload: { url: 'https://example.org/new-destination?token=do-not-log' },
        })
      ).statusCode,
    ).toBe(200);
    expect((await send({ method: 'DELETE', path })).statusCode).toBe(204);

    const scoped = {
      actor_user_public_id: user.public_id,
      organization_public_id: organization.public_id,
    };
    expect(await stagedRows('notify.webhook.create')).toEqual([
      expect.objectContaining({
        ...scoped,
        severity: 'WARNING',
        metadata: { webhook_public_id: webhookId, url_origin: 'https://example.com' },
      }),
    ]);
    const updates = await stagedRows('notify.webhook.update');
    expect(updates.map((row) => [row.severity, row.metadata])).toEqual([
      ['INFO', { webhook_public_id: webhookId, changed_fields: ['is_enabled'] }],
      [
        'WARNING',
        {
          webhook_public_id: webhookId,
          changed_fields: ['url'],
          url_origin: 'https://example.org',
        },
      ],
    ]);
    expect(await stagedRows('notify.webhook.delete')).toEqual([
      expect.objectContaining({
        ...scoped,
        severity: 'INFO',
        metadata: { webhook_public_id: webhookId },
      }),
    ]);
    const everyRow = JSON.stringify(await getOperatorDatabase().select().from(audit_outbox));
    expect(everyRow).not.toContain('do-not-log');

    const result = await withMaintenanceDatabaseContext(
      MAINTENANCE_SCOPE.AUDIT_OUTBOX_DRAIN,
      (databaseHandle) => runAuditOutboxDrainJob(databaseHandle),
    );
    expect(result.transientFailed + result.permanentlyFailed).toBe(0);
  });
});
