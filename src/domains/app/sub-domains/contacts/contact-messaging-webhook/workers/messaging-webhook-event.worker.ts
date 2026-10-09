import { getBullMQConnectionOptions } from '@/infrastructure/queue/connection.js';
import { getDefaultWorkerOptions } from '@/infrastructure/queue/worker-runtime/worker-options.js';
import { buildWorkerHandle } from '@/infrastructure/queue/worker-runtime/worker-close.util.js';
import { createProviderPausableWorker } from '@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js';
import { parseJobDataOrDeadLetter } from '@/infrastructure/queue/dlq/poison-job.util.js';
import { runWithPropagatedTraceContext } from '@/infrastructure/observability/tracing/trace-context.util.js';
import type { WorkerHandle } from '@/infrastructure/queue/bootstrap.js';
import { getWorkerConcurrencyNotify } from '@/shared/config/worker-concurrency.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  type MessagingWebhookEventJobData,
  messagingWebhookEventJobDataSchema,
} from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/queues/messaging-webhook-event.job.schema.js';
import { MESSAGING_WEBHOOK_EVENT_QUEUE_NAME } from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/queues/messaging-webhook-event.queue.js';
import { runMessagingWebhookEventJob } from './messaging-webhook-event.processor.js';

/**
 * Applies each organization's stored messaging callbacks (launch D77, WC-1 statuses, WC-3 replies).
 *
 * @remarks
 * - **Algorithm:** validates the payload (`parseJobDataOrDeadLetter`), carries the trace, and runs
 *   {@link runMessagingWebhookEventJob}.
 * - **Failure modes:** while Meta is down during an Instagram name lookup the queue pauses
 *   (`createProviderPausableWorker`, provider `meta`); other errors take BullMQ's retry/backoff.
 *   Stalled jobs are warn-logged.
 * - **Side effects:** a BullMQ Redis connection; short Postgres checkouts per update.
 * - **Notes:** pull-based; the webhook enqueues its organization after storing a callback and the
 *   one-minute messaging sweep re-enqueues any organization with pending callbacks. Runs only while
 *   the webhook is configured (registry `isEnabled`).
 */
export function createMessagingWebhookEventWorker(): WorkerHandle {
  const worker = createProviderPausableWorker<MessagingWebhookEventJobData>({
    queueName: MESSAGING_WEBHOOK_EVENT_QUEUE_NAME,
    provider: 'meta',
    processor: async (job) => {
      const jobData = await parseJobDataOrDeadLetter({
        schema: messagingWebhookEventJobDataSchema,
        job,
        queueName: MESSAGING_WEBHOOK_EVENT_QUEUE_NAME,
      });
      return runWithPropagatedTraceContext(
        { traceparent: jobData.traceparent, tracestate: jobData.tracestate },
        job.name,
        () => runMessagingWebhookEventJob(jobData.organizationPublicId),
      );
    },
    workerOptions: {
      connection: getBullMQConnectionOptions(),
      concurrency: getWorkerConcurrencyNotify(),
      ...getDefaultWorkerOptions(),
    },
  });

  worker.on('stalled', (jobId) => {
    logger.warn(
      { jobId, queue: MESSAGING_WEBHOOK_EVENT_QUEUE_NAME },
      'messaging-webhook-event.stalled',
    );
  });

  return buildWorkerHandle(worker, MESSAGING_WEBHOOK_EVENT_QUEUE_NAME);
}
