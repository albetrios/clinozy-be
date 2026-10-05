import { Worker } from 'bullmq';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import {
  getRetentionWorkerOptions,
  RETENTION_WORKER_CONCURRENCY,
} from '@/infrastructure/queue/worker-runtime/worker-options.js';
import { buildWorkerHandle } from '@/infrastructure/queue/worker-runtime/worker-close.util.js';
import type { WorkerHandle } from '@/infrastructure/queue/bootstrap.js';
import { runUploadTombstoneRetentionJob } from '@/domains/upload/workers/upload-tombstone-retention.processor.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { UPLOAD_TOMBSTONE_RETENTION_QUEUE_NAME } from './upload-tombstone-retention.constants.js';

/**
 * Hard-delete uploads tombstoned longer than TOMBSTONE_RETENTION_DAYS.
 * Removes S3 objects before deleting rows.
 *
 * @remarks
 * - **Algorithm:** delegates to {@link runUploadTombstoneRetentionJob}, which opens a short
 *   global-retention context per page (so RLS allows cross-tenant deletes) and keeps every S3
 *   call outside them.
 * - **Failure modes:** processor errors are bubbled to BullMQ for retry;
 *   stalled jobs are surfaced via a `stalled` log warning. DLQ + Sentry hook
 *   is attached by the queue bootstrap.
 * - **Side effects:** none beyond what the processor performs (S3 object deletes, then the
 *   hard-deletes of the rows whose objects are gone).
 * - **Notes:** concurrency capped at {@link RETENTION_WORKER_CONCURRENCY};
 *   stall/lock tuning from {@link getRetentionWorkerOptions} accommodates
 *   long purge runs.
 */
export function createUploadTombstoneRetentionWorker(): WorkerHandle {
  const worker = new Worker(
    UPLOAD_TOMBSTONE_RETENTION_QUEUE_NAME,
    async () => runUploadTombstoneRetentionJob(),
    {
      connection: getBullMQConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
      concurrency: RETENTION_WORKER_CONCURRENCY,
      ...getRetentionWorkerOptions(),
    },
  );

  worker.on('stalled', (jobId) => {
    logger.warn(
      { jobId, queue: UPLOAD_TOMBSTONE_RETENTION_QUEUE_NAME },
      'upload-tombstone-retention.stalled',
    );
  });

  return buildWorkerHandle(worker, UPLOAD_TOMBSTONE_RETENTION_QUEUE_NAME);
}
