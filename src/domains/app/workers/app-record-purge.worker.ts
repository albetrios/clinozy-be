import { Worker } from 'bullmq';
import {
  MAINTENANCE_SCOPE,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
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
import { runAppRecordPurgeJob } from '@/domains/app/workers/app-record-purge.processor.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { APP_RECORD_PURGE_QUEUE_NAME } from './app-record-purge.constants.js';

/**
 * Erases deleted app records past each organization's restore window (WC-46, D38), daily.
 *
 * @remarks
 * - **Algorithm:** a BullMQ `Worker` on {@link APP_RECORD_PURGE_QUEUE_NAME} that runs
 *   {@link runAppRecordPurgeJob} inside {@link withMaintenanceDatabaseContext} (the global
 *   retention cleanup scope, so RLS lets it see every organization).
 * - **Failure modes:** processor errors feed BullMQ retry/backoff; permanent failures land in
 *   the queue's DLQ; the next day's run retries what was blocked.
 * - **Side effects:** a BullMQ Redis connection and a Postgres handle per job; logs.
 * - **Notes:** registered through the worker registry and scheduled in `scheduler.ts`.
 */
export function createAppRecordPurgeWorker(): WorkerHandle {
  const worker = new Worker(
    APP_RECORD_PURGE_QUEUE_NAME,
    async () =>
      withMaintenanceDatabaseContext({
        scope: MAINTENANCE_SCOPE.GLOBAL_RETENTION_CLEANUP,
        callback: (databaseHandle) => runAppRecordPurgeJob(databaseHandle),
      }),
    {
      connection: getBullMQConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
      concurrency: RETENTION_WORKER_CONCURRENCY,
      ...getRetentionWorkerOptions(),
    },
  );

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId, queue: APP_RECORD_PURGE_QUEUE_NAME }, 'app-record-purge.stalled');
  });

  return buildWorkerHandle({ worker, queueName: APP_RECORD_PURGE_QUEUE_NAME });
}
