import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { users } from '@/domains/user/user.schema.js';
import { user_data_exports } from '@/domains/user/sub-domains/user-data-export/user-data-export.schema.js';
import {
  closeUserDataExportQueue,
  USER_DATA_EXPORT_QUEUE_NAME,
} from '@/domains/user/sub-domains/user-data-export/queues/user-data-export.queue.js';
import type { UserDataExportJobData } from '@/domains/user/sub-domains/user-data-export/queues/user-data-export.job.schema.js';
import { runUserDataExportReclaimJob } from '@/domains/user/sub-domains/user-data-export/workers/user-data-export-reclaim.processor.js';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';

const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * The export queue's lost-enqueue sweep against Postgres and Redis: an export left `pending` with no
 * job (its post-commit add failed) is re-added under its own public id, a fresh one is left to its
 * own job, and a deleted user's is skipped. Under `pnpm test:rls-role` the read runs as the
 * RLS-subject application role, so the retention context must see `auth.user_data_exports` and
 * `auth.users` across users.
 */
describe('User data export — lost-enqueue reclaim', () => {
  const exportQueue = new Queue<UserDataExportJobData>(USER_DATA_EXPORT_QUEUE_NAME, {
    connection: getBullMQConnectionOptions(),
    prefix: getBullMQKeyPrefix(),
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  afterAll(async () => {
    await exportQueue.close();
    await closeUserDataExportQueue();
    await cleanupDatabase();
  });

  async function insertPendingExport(options: { userId: number; requestedAt: Date }) {
    const publicId = generatePublicId('userDataExport');
    await getOperatorDatabase()
      .insert(user_data_exports)
      .values({
        public_id: publicId,
        user_id: options.userId,
        status: 'pending',
        s3_key: `exports/${options.userId}/${publicId}.zip`,
        expires_at: new Date(Date.now() + TEN_MINUTES_MS),
        created_at: options.requestedAt,
      });
    return publicId;
  }

  it('re-adds an export left pending with no job — once, and only that one', async () => {
    const lostOwner = await createTestUser();
    const freshOwner = await createTestUser();
    const departedOwner = await createTestUser();
    const longAgo = new Date(Date.now() - TEN_MINUTES_MS);
    const lostExport = await insertPendingExport({ userId: lostOwner.id, requestedAt: longAgo });
    await insertPendingExport({ userId: freshOwner.id, requestedAt: new Date() });
    await insertPendingExport({ userId: departedOwner.id, requestedAt: longAgo });
    await getOperatorDatabase()
      .update(users)
      .set({ deleted_at: new Date() })
      .where(eq(users.id, departedOwner.id));

    expect(await runUserDataExportReclaimJob()).toEqual({ scannedCount: 1, addedCount: 1 });

    const job = await exportQueue.getJob(lostExport);
    expect(job?.data).toMatchObject({
      exportPublicId: lostExport,
      userPublicId: lostOwner.public_id,
    });
    // A second pass finds the same row, but the job id is the export's: no second job. (Other
    // suites leave jobs on this queue, so count this export's only.)
    await runUserDataExportReclaimJob();
    const jobsForTheExport = (await exportQueue.getJobs(['waiting', 'delayed'])).filter(
      (queued) => queued.data.exportPublicId === lostExport,
    );
    expect(jobsForTheExport).toHaveLength(1);
  });
});
