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
import { runWebhookDeliveryReclaimJob } from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery-reclaim.processor.js';
import { WEBHOOK_DELIVERY_RECLAIM_QUEUE_NAME } from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery-reclaim.constants.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/**
 * BullMQ worker wrapping {@link runWebhookDeliveryReclaimJob} on the webhook-delivery reclaim
 * queue.
 *
 * @remarks
 * - **Algorithm:** one job per cron tick (`scheduler.ts`); concurrency
 *   `RETENTION_WORKER_CONCURRENCY`, so two sweeps never overlap in one process.
 * - **Failure modes:** processor errors go to BullMQ retry and the dead-letter path; stalled jobs
 *   are logged at warn.
 * - **Side effects:** see {@link runWebhookDeliveryReclaimJob} — re-enqueues lost delivery jobs.
 * - **Notes:** registered in `worker-registration.registry.ts` under the `webhook` family, so it
 *   runs wherever the delivery worker runs; the returned handle closes it on shutdown.
 */
export function createWebhookDeliveryReclaimWorker(): WorkerHandle {
  const worker = new Worker(
    WEBHOOK_DELIVERY_RECLAIM_QUEUE_NAME,
    async () => runWebhookDeliveryReclaimJob(),
    {
      connection: getBullMQConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
      concurrency: RETENTION_WORKER_CONCURRENCY,
      ...getRetentionWorkerOptions(),
    },
  );

  worker.on('stalled', (jobId) => {
    logger.warn(
      { jobId, queue: WEBHOOK_DELIVERY_RECLAIM_QUEUE_NAME },
      'webhook-delivery-reclaim.stalled',
    );
  });

  return buildWorkerHandle({ worker, queueName: WEBHOOK_DELIVERY_RECLAIM_QUEUE_NAME });
}
