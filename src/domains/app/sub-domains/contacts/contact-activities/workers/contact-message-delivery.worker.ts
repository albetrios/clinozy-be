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
  type ContactMessageDeliveryJobData,
  contactMessageDeliveryJobDataSchema,
} from '@/domains/app/sub-domains/contacts/contact-activities/queues/contact-message-delivery.job.schema.js';
import { CONTACT_MESSAGE_DELIVERY_QUEUE_NAME } from '@/domains/app/sub-domains/contacts/contact-activities/queues/contact-message-delivery.queue.js';
import { runContactMessageDeliveryJob } from './contact-message-delivery.processor.js';

/**
 * Sends each organization's queued WhatsApp and Instagram messages (launch D77, WC-1, WC-2).
 *
 * @remarks
 * - **Algorithm:** validates the payload (`parseJobDataOrDeadLetter` — a malformed one is
 *   dead-lettered at once), carries the trace, and runs {@link runContactMessageDeliveryJob}.
 * - **Failure modes:** while Meta is down or throttling, the queue pauses on every replica
 *   (`createProviderPausableWorker`, provider `meta`) and the job waits without spending an
 *   attempt — its messages stay `queued`; other errors take BullMQ's retry/backoff, then the dead
 *   letter. Stalled jobs are warn-logged.
 * - **Side effects:** a BullMQ Redis connection; short Postgres checkouts around each send.
 * - **Notes:** pull-based; a message write enqueues its organization after the commit and the
 *   one-minute messaging sweep re-enqueues any organization with unclaimed queued messages. Runs
 *   only while `MESSAGING_DELIVERY_ENABLED` is on (registry `isEnabled`).
 */
export function createContactMessageDeliveryWorker(): WorkerHandle {
  const worker = createProviderPausableWorker<ContactMessageDeliveryJobData>({
    queueName: CONTACT_MESSAGE_DELIVERY_QUEUE_NAME,
    provider: 'meta',
    processor: async (job) => {
      const jobData = await parseJobDataOrDeadLetter({
        schema: contactMessageDeliveryJobDataSchema,
        job,
        queueName: CONTACT_MESSAGE_DELIVERY_QUEUE_NAME,
      });
      return runWithPropagatedTraceContext(
        { traceparent: jobData.traceparent, tracestate: jobData.tracestate },
        job.name,
        () => runContactMessageDeliveryJob(jobData.organizationPublicId),
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
      { jobId, queue: CONTACT_MESSAGE_DELIVERY_QUEUE_NAME },
      'contact-message-delivery.stalled',
    );
  });

  return buildWorkerHandle(worker, CONTACT_MESSAGE_DELIVERY_QUEUE_NAME);
}
