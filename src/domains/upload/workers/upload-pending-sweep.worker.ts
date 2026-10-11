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
import { runUploadPendingSweepJob } from '@/domains/upload/workers/upload-pending-sweep.processor.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { UPLOAD_PENDING_SWEEP_QUEUE_NAME } from './upload-pending-sweep.constants.js';

/**
 * Reconciles orphan PENDING uploads (presigned URL issued, confirm never called).
 * Repeatable schedule: src/infrastructure/queue/scheduler.ts.
 *
 * @remarks
 * - **Algorithm:** delegates to {@link runUploadPendingSweepJob}, which opens a short
 *   global-retention context per database step (so RLS allows cross-tenant scans) and keeps
 *   every S3 call outside them.
 * - **Failure modes:** processor errors are bubbled to BullMQ for retry;
 *   stalled jobs are surfaced via a `stalled` log warning. The DLQ + Sentry
 *   hook is attached by the queue bootstrap.
 * - **Side effects:** none beyond what the processor performs (DB writes, S3 copies and
 *   best-effort S3 deletes).
 * - **Notes:** concurrency capped at {@link RETENTION_WORKER_CONCURRENCY};
 *   stall/lock tuning from {@link getRetentionWorkerOptions} accommodates
 *   batch durations that include S3 latency.
 */
export function createUploadPendingSweepWorker(): WorkerHandle {
  const worker = new Worker(
    UPLOAD_PENDING_SWEEP_QUEUE_NAME,
    async () => runUploadPendingSweepJob(),
    {
      connection: getBullMQConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
      concurrency: RETENTION_WORKER_CONCURRENCY,
      ...getRetentionWorkerOptions(),
    },
  );

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId, queue: UPLOAD_PENDING_SWEEP_QUEUE_NAME }, 'upload-pending-sweep.stalled');
  });

  return buildWorkerHandle({ worker, queueName: UPLOAD_PENDING_SWEEP_QUEUE_NAME });
}
