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
import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import type { WorkerHandle } from '@/infrastructure/queue/bootstrap.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { purgeOldMessagingWebhookEvents } from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.repository.js';
import { MESSAGING_WEBHOOK_EVENT_RETENTION_QUEUE_NAME } from './contact-messaging-webhook.constants.js';

/**
 * Removes stored messaging callbacks past their 30 days (launch D77), daily — processed and
 * failed ones only; a pending one stays until applied.
 *
 * @remarks
 * - **Algorithm:** a BullMQ `Worker` on {@link MESSAGING_WEBHOOK_EVENT_RETENTION_QUEUE_NAME} that
 *   runs {@link purgeOldMessagingWebhookEvents} under the global retention cleanup context (the
 *   table's bypass arm lets it see every organization), in capped batches.
 * - **Failure modes:** a database error feeds BullMQ retry/backoff; the next day's run continues.
 * - **Side effects:** DELETEs on `app.messaging_webhook_events`; logs.
 * - **Notes:** registered through the worker registry and scheduled in `scheduler.ts`.
 */
export function createMessagingWebhookEventRetentionWorker(): WorkerHandle {
  const worker = new Worker(
    MESSAGING_WEBHOOK_EVENT_RETENTION_QUEUE_NAME,
    async () => {
      const result = await runGlobalRetentionWorkerJob((handle) =>
        purgeOldMessagingWebhookEvents(handle),
      );
      logger.info(result, 'messaging-webhook-event-retention.completed');
      return result;
    },
    {
      connection: getBullMQConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
      concurrency: RETENTION_WORKER_CONCURRENCY,
      ...getRetentionWorkerOptions(),
    },
  );

  worker.on('stalled', (jobId) => {
    logger.warn(
      { jobId, queue: MESSAGING_WEBHOOK_EVENT_RETENTION_QUEUE_NAME },
      'messaging-webhook-event-retention.stalled',
    );
  });

  return buildWorkerHandle({ worker, queueName: MESSAGING_WEBHOOK_EVENT_RETENTION_QUEUE_NAME });
}
