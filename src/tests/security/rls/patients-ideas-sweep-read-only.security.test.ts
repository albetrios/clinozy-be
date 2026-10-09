import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { type SQL, sql as drizzleSql } from 'drizzle-orm';
import { database } from '@/infrastructure/database/connection.js';
import {
  type RequestScopedPostgresDatabase,
  setLocalApplicationRole,
  setLocalDatabaseConfig,
  setLocalMaintenanceRole,
} from '@/infrastructure/database/contexts/database-context-runtime.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createAppFixture } from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';

type RoleSwitch = (databaseHandle: RequestScopedPostgresDatabase) => Promise<void>;

/**
 * Runs `statement` in its own transaction under `role` with the global retention GUC armed and no
 * organization set; answers how many rows it reported. The transaction rolls back, so a write the
 * policy wrongly allowed leaves nothing behind.
 */
async function probe(options: { role: RoleSwitch; statement: SQL }): Promise<number> {
  let count = 0;
  await database
    .transaction(async (transaction) => {
      const databaseHandle = transaction as unknown as RequestScopedPostgresDatabase;
      await options.role(databaseHandle);
      await setLocalDatabaseConfig(databaseHandle, 'app.global_retention_cleanup', 'true');
      const result = await databaseHandle.execute(options.statement);
      const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
      count = rows.length;
      throw new Error('rollback');
    })
    .catch((error: unknown) => {
      if (!(error instanceof Error && error.message === 'rollback')) throw error;
    });
  return count;
}

/**
 * The AI ideas sweep's arm on `app.patients` is a read (task RL2,
 * docs/reviews/launch-confidence-plan-2026-10-09.md; D80, WC-47; P7 — a patient file is never
 * purged): under the global retention context the maintenance role reads the files of every
 * organization, and can neither change nor delete one. The application role reads none.
 */
describe('Security: the patients retention arm is read-only', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    const fixture = await createAppFixture(app);
    const flow = new AppFlow(app, fixture).as('owner');
    await flow.expect(200, 'a contact', 'POST', '/app/contacts', {
      first_name: 'Rita',
      last_name: `s${Date.now()}`,
      phones: [{ phone: '+919812300001', is_primary: true }],
    });
    await flow.expect(200, 'her patient file', 'POST', '/app/patients', {
      contact_id: flow.last('.data.id'),
      home_branch_id: fixture.branches.vesu,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets the maintenance role read the files across organizations (the sweep)', async () => {
    expect(
      await probe({
        role: setLocalMaintenanceRole,
        statement: drizzleSql`SELECT id FROM app.patients`,
      }),
    ).toBeGreaterThan(0);
  });

  it('gives the maintenance role no update of a file', async () => {
    expect(
      await probe({
        role: setLocalMaintenanceRole,
        statement: drizzleSql`UPDATE app.patients SET notes = 'changed' RETURNING id`,
      }),
    ).toBe(0);
  });

  it('gives the maintenance role no delete of a file (P7)', async () => {
    expect(
      await probe({
        role: setLocalMaintenanceRole,
        statement: drizzleSql`DELETE FROM app.patients RETURNING id`,
      }),
    ).toBe(0);
  });

  it('opens nothing to the application role', async () => {
    expect(
      await probe({
        role: setLocalApplicationRole,
        statement: drizzleSql`SELECT id FROM app.patients`,
      }),
    ).toBe(0);
  });
});
