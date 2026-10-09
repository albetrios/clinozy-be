import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import { runAppRecordPurgeJob } from '@/domains/app/workers/app-record-purge.processor.js';

/**
 * WC-46 (D38, launch ROUTE #147): a deleted app record is restorable for the clinic's purge
 * window, then erased for good by the daily purge — a live record never is. Offering groups stand
 * in for every `app.*` table (the job walks them all the same way).
 */
describe('App record purge — integration (WC-46, D38)', () => {
  const S = String(Date.now());

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;

  /** A new offering group; answers its id. */
  async function group(name: string): Promise<string> {
    await flow.expect(200, `group ${name}`, 'POST', '/app/offering-groups', {
      name: `${name} ${S}`,
    });
    return flow.last('.data.id');
  }

  /** Deletes a group through the API, then dates the deletion `daysAgo` days back. */
  async function deletedDaysAgo(id: string, daysAgo: number): Promise<void> {
    await flow.expect(204, `delete ${id}`, 'DELETE', `/app/offering-groups/${id}?reason=mistake`);
    await getOperatorSql()`
      UPDATE app.offering_groups SET deleted_at = now() - make_interval(days => ${daysAgo})
      WHERE public_id = ${id}
    `;
  }

  /** The clinic's restore window, in days. */
  async function purgeAfter(days: number): Promise<void> {
    await getOperatorSql()`
      INSERT INTO tenancy.organization_settings (organization_id, deleted_record_purge_days)
      VALUES (${fixture.organization.id}, ${days})
      ON CONFLICT (organization_id) DO UPDATE SET deleted_record_purge_days = EXCLUDED.deleted_record_purge_days
    `;
  }

  /** Which of the groups are still stored (deleted or not). */
  async function stored(ids: readonly string[]): Promise<string[]> {
    const rows = await getOperatorSql()<{ public_id: string }[]>`
      SELECT public_id FROM app.offering_groups WHERE public_id = ANY(${ids as string[]})
    `;
    return rows.map((row) => row.public_id).sort();
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    flow.as('owner');
  });

  afterAll(async () => {
    await app.close();
  });

  it('erases what was deleted before the window; keeps the restorable and the live', async () => {
    await purgeAfter(7);
    const old = await group('Old');
    const recent = await group('Recent');
    const live = await group('Live');
    await deletedDaysAgo(old, 8);
    await deletedDaysAgo(recent, 2);

    const run = await runGlobalRetentionWorkerJob((handle) => runAppRecordPurgeJob(handle));
    expect(run.deletedCount).toBeGreaterThanOrEqual(1);
    expect(await stored([old, recent, live])).toEqual([live, recent].sort());

    await flow.expect(
      200,
      'the recent one is still restorable',
      'POST',
      `/app/offering-groups/${recent}/restore`,
    );
    await flow.expect(404, 'the erased one is gone', 'POST', `/app/offering-groups/${old}/restore`);
  });

  it("follows the clinic's window: a longer one keeps an older deletion", async () => {
    await purgeAfter(30);
    const kept = await group('Kept');
    await deletedDaysAgo(kept, 10);
    await runGlobalRetentionWorkerJob((handle) => runAppRecordPurgeJob(handle));
    expect(await stored([kept])).toEqual([kept]);

    await purgeAfter(7);
    await runGlobalRetentionWorkerJob((handle) => runAppRecordPurgeJob(handle));
    expect(await stored([kept])).toEqual([]);
  });
});
