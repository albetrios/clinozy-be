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
import { CONTACT_MESSAGING_SWEEP_QUEUE_NAME } from './contact-messaging-webhook.constants.js';
import { runContactMessagingSweepJob } from './contact-messaging-sweep.processor.js';

/**
 * The one-minute messaging sweep (launch D77) — re-enqueues the organizations with unclaimed
 * queued messages or pending callbacks.
 *
 * @remarks
 * - **Algorithm:** a BullMQ `Worker` on {@link CONTACT_MESSAGING_SWEEP_QUEUE_NAME} that runs
 *   {@link runContactMessagingSweepJob} (reads under the global retention cleanup context, the
 *   adds outside it).
 * - **Failure modes:** a read error feeds BullMQ retry/backoff; the next minute repeats it.
 * - **Side effects:** a BullMQ Redis connection; a Postgres checkout per batch read; logs.
 * - **Notes:** registered through the worker registry (family `notify`, with the queues it backs)
 *   and scheduled in `scheduler.ts`.
 */
export function createContactMessagingSweepWorker(): WorkerHandle {
  const worker = new Worker(
    CONTACT_MESSAGING_SWEEP_QUEUE_NAME,
    async () => runContactMessagingSweepJob(),
    {
      connection: getBullMQConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
      concurrency: RETENTION_WORKER_CONCURRENCY,
      ...getRetentionWorkerOptions(),
    },
  );

  worker.on('stalled', (jobId) => {
    logger.warn(
      { jobId, queue: CONTACT_MESSAGING_SWEEP_QUEUE_NAME },
      'contact-messaging-sweep.stalled',
    );
  });

  return buildWorkerHandle(worker, CONTACT_MESSAGING_SWEEP_QUEUE_NAME);
}
