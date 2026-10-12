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
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { DAY_CLOSE_AUTO_CLOSE_SWEEP_QUEUE_NAME } from './day-close-auto-close.constants.js';
import { runDayCloseAutoCloseSweepJob } from './day-close-auto-close-sweep.processor.js';

/**
 * The hourly day auto-close sweep (WC-39, B26) — adds one auto-close job per organization with a
 * past day to close.
 *
 * @remarks
 * - **Algorithm:** a BullMQ `Worker` on {@link DAY_CLOSE_AUTO_CLOSE_SWEEP_QUEUE_NAME} that runs
 *   {@link runDayCloseAutoCloseSweepJob} (read under the global retention cleanup context, then
 *   the adds outside it).
 * - **Failure modes:** a read error feeds BullMQ retry/backoff; the next hour's run repeats it.
 * - **Side effects:** a BullMQ Redis connection; a Postgres checkout per run; logs.
 * - **Notes:** registered through the worker registry and scheduled in `scheduler.ts`.
 */
export function createDayCloseAutoCloseSweepWorker(): WorkerHandle {
  const worker = new Worker(
    DAY_CLOSE_AUTO_CLOSE_SWEEP_QUEUE_NAME,
    async () => runDayCloseAutoCloseSweepJob(),
    {
      connection: getBullMQConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
      concurrency: RETENTION_WORKER_CONCURRENCY,
      ...getRetentionWorkerOptions(),
    },
  );

  worker.on('stalled', (jobId) => {
    logger.warn(
      { jobId, queue: DAY_CLOSE_AUTO_CLOSE_SWEEP_QUEUE_NAME },
      'day-close-auto-close-sweep.stalled',
    );
  });

  return buildWorkerHandle({ worker, queueName: DAY_CLOSE_AUTO_CLOSE_SWEEP_QUEUE_NAME });
}
