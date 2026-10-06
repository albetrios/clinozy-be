import {
  findTombstonedUploadsBefore,
  hardDeleteUploadsByInternalIds,
} from '@/domains/upload/upload.repository.js';
import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import type { ObjectStoragePort } from '@/infrastructure/storage/object-storage.port.js';
import { getDefaultS3ObjectStorageAdapter } from '@/infrastructure/storage/s3-adapter.js';
import {
  purgeRowsAfterTheirObjects,
  type StoredObjectPurgeResult,
} from '@/infrastructure/storage/stored-object-purge.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { env } from '@/shared/config/env.config.js';

const PURGE_BATCH_SIZE = 500;

/**
 * Hard-deletes upload rows soft-deleted longer than `TOMBSTONE_RETENTION_DAYS`, each only once its
 * S3 object is gone.
 *
 * @remarks
 * - **Algorithm:** {@link purgeRowsAfterTheirObjects} over keyset pages of
 *   {@link PURGE_BATCH_SIZE}; each page is read, and its rows deleted, in its own short
 *   global-retention context (RLS lets the purge cross tenants), with the S3 deletes outside both.
 * - **Failure modes:** a failed S3 delete keeps the row for the next run — deleting it would leave
 *   an object nothing references, user content kept past its deletion date. An open S3 circuit
 *   ends the run early. Database errors bubble to BullMQ; deleted pages stay deleted.
 * - **Side effects:** deletes S3 objects, then hard-deletes from `upload.uploads`. No events.
 * - **Notes:** re-runnable; `objectStorage` is injectable for tests.
 */
export async function runUploadTombstoneRetentionJob(
  objectStorage: ObjectStoragePort = getDefaultS3ObjectStorageAdapter(),
): Promise<StoredObjectPurgeResult> {
  const retentionDays = env.TOMBSTONE_RETENTION_DAYS;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  logger.info(
    { retentionDays, cutoffDate: cutoff.toISOString() },
    'upload-tombstone-retention.starting',
  );

  const result = await purgeRowsAfterTheirObjects({
    objectStorage,
    batchSize: PURGE_BATCH_SIZE,
    readBatch: ({ afterId, limit }) =>
      runGlobalRetentionWorkerJob(async (databaseHandle) => {
        const rows = await findTombstonedUploadsBefore(databaseHandle, { cutoff, afterId, limit });
        return rows.map((row) => ({
          id: row.id,
          objectKey: row.file_key,
          publicId: row.public_id,
        }));
      }),
    deleteRows: async (ids) => {
      await runGlobalRetentionWorkerJob((databaseHandle) =>
        hardDeleteUploadsByInternalIds(databaseHandle, ids),
      );
    },
    onObjectKept: (row) =>
      logger.warn(
        { uploadPublicId: row.publicId, fileKey: row.objectKey },
        'upload-tombstone-retention.objectDeleteFailed',
      ),
  });

  logger.info({ ...result, retentionDays }, 'upload-tombstone-retention.completed');
  return result;
}
