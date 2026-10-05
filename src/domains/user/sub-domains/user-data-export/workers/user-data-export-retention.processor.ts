import {
  findExpiredExportsWithObjectBefore,
  hardDeleteExportsByInternalIds,
} from '@/domains/user/sub-domains/user-data-export/user-data-export.repository.js';
import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import type { ObjectStoragePort } from '@/infrastructure/storage/object-storage.port.js';
import { getDefaultS3ObjectStorageAdapter } from '@/infrastructure/storage/s3-adapter.js';
import {
  purgeRowsAfterTheirObjects,
  type StoredObjectPurgeResult,
} from '@/infrastructure/storage/stored-object-purge.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

const PURGE_BATCH_SIZE = 500;

/**
 * Purges GDPR export rows whose download window has closed, each only once its S3 object is gone.
 *
 * @remarks
 * - **Algorithm:** {@link purgeRowsAfterTheirObjects} over keyset pages of
 *   {@link PURGE_BATCH_SIZE} expired rows that still name an object; each page is read, and its
 *   rows deleted, in its own short global-retention context, with the S3 deletes outside both.
 * - **Failure modes:** a failed S3 delete keeps the row for the next run — the export is the
 *   user's personal data, and a row-less object would outlive its expiry with nothing pointing at
 *   it. An open S3 circuit ends the run early. Database errors propagate to BullMQ.
 * - **Side effects:** deletes S3 objects under the export prefix, then rows from
 *   `auth.user_data_exports`; `info` start/end logs and a `warn` per kept row.
 * - **Notes:** idempotent — once clean, a run deletes nothing. `objectStorage` is injectable for
 *   tests.
 */
export async function runUserDataExportRetentionJob(
  objectStorage: ObjectStoragePort = getDefaultS3ObjectStorageAdapter(),
): Promise<StoredObjectPurgeResult> {
  const cutoff = new Date();

  logger.info({ cutoffDate: cutoff.toISOString() }, 'user-data-export-retention.starting');

  const result = await purgeRowsAfterTheirObjects({
    objectStorage,
    batchSize: PURGE_BATCH_SIZE,
    readBatch: ({ afterId, limit }) =>
      runGlobalRetentionWorkerJob(async (databaseHandle) => {
        const rows = await findExpiredExportsWithObjectBefore(databaseHandle, {
          cutoff,
          afterId,
          limit,
        });
        return rows.map((row) => ({ id: row.id, objectKey: row.s3_key, publicId: row.public_id }));
      }),
    deleteRows: async (ids) => {
      await runGlobalRetentionWorkerJob((databaseHandle) =>
        hardDeleteExportsByInternalIds(databaseHandle, ids),
      );
    },
    onObjectKept: (row) =>
      logger.warn(
        { exportPublicId: row.publicId, s3Key: row.objectKey },
        'user-data-export-retention.objectDeleteFailed',
      ),
  });

  logger.info(result, 'user-data-export-retention.completed');
  return result;
}
