import { enqueueWebhookDelivery } from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js';
import { findStalePendingDeliveryAttempts } from '@/domains/notify/sub-domains/webhook/webhook-delivery/webhook-delivery.repository.js';
import {
  WEBHOOK_DELIVERY_RECLAIM_BATCH_SIZE,
  WEBHOOK_DELIVERY_RECLAIM_QUEUE_NAME,
  WEBHOOK_DELIVERY_RECLAIM_STALE_AFTER_MS,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery-reclaim.constants.js';
import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/**
 * Counters from one {@link runWebhookDeliveryReclaimJob} run: `scannedCount` stale `PENDING`
 * attempts found, `addedCount` of them handed to the delivery queue.
 *
 * @remarks
 * - **Algorithm:** filled by the sweep after its read and its adds.
 * - **Failure modes:** an add that failed counts in `scannedCount` only; its attempt stays
 *   `PENDING` for the next sweep.
 * - **Side effects:** none — a return shape.
 * - **Notes:** `addedCount` includes adds BullMQ dropped because the attempt's job still exists
 *   (the job id is the attempt's public id); only a lost job is actually re-created.
 */
export type WebhookDeliveryReclaimJobResult = {
  scannedCount: number;
  addedCount: number;
};

/**
 * Re-enqueues outbound webhook deliveries whose job was lost, so a delivery survives Redis
 * refusing the enqueue.
 *
 * @remarks
 * - **Algorithm:** one short global-retention read of up to
 *   {@link WEBHOOK_DELIVERY_RECLAIM_BATCH_SIZE} attempts still `PENDING` after
 *   {@link WEBHOOK_DELIVERY_RECLAIM_STALE_AFTER_MS}, oldest first; then, with no database context
 *   open, {@link enqueueWebhookDelivery} for each. The job id is the attempt's public id, so an
 *   attempt whose job still exists — queued behind a backlog, retained after a dead-letter — is
 *   left alone: BullMQ drops the add. Only a lost job is re-created.
 * - **Failure modes:** a failed add is logged and retried by the next sweep (the row stays
 *   `PENDING`); a failed read throws to BullMQ, and the next scheduled run starts over.
 * - **Side effects:** adds jobs to the `webhook-delivery` queue. Changes no row — the delivery
 *   worker owns the attempt's status.
 * - **Notes:** the delivery job is enqueued after the transaction commits, and producers fail fast
 *   while Redis is unreachable or full (`noeviction`); without this sweep such a delivery, or one
 *   whose process died between the commit and the enqueue, was never sent. `now` is injectable
 *   for tests. Cron in `src/infrastructure/queue/scheduler.ts`.
 */
export async function runWebhookDeliveryReclaimJob(
  options: { now?: Date } = {},
): Promise<WebhookDeliveryReclaimJobResult> {
  const createdBefore = new Date(
    (options.now ?? new Date()).getTime() - WEBHOOK_DELIVERY_RECLAIM_STALE_AFTER_MS,
  );
  const staleAttempts = await runGlobalRetentionWorkerJob((databaseHandle) =>
    findStalePendingDeliveryAttempts(databaseHandle, {
      createdBefore,
      limit: WEBHOOK_DELIVERY_RECLAIM_BATCH_SIZE,
    }),
  );

  // Added together, each with its own try/catch: one failed add must not stop the rest.
  const addOutcomes = await Promise.all(
    staleAttempts.map(async (staleAttempt) => {
      try {
        await enqueueWebhookDelivery({
          deliveryAttemptPublicId: staleAttempt.deliveryAttemptPublicId,
          organizationPublicId: staleAttempt.organizationPublicId,
          requestId: WEBHOOK_DELIVERY_RECLAIM_QUEUE_NAME,
        });
        return true;
      } catch (error) {
        logger.warn(
          { error, deliveryAttemptPublicId: staleAttempt.deliveryAttemptPublicId },
          'webhook-delivery-reclaim.enqueue.failed',
        );
        return false;
      }
    }),
  );
  const result = {
    scannedCount: staleAttempts.length,
    addedCount: addOutcomes.filter(Boolean).length,
  };
  logger.info(result, 'webhook-delivery-reclaim.completed');
  return result;
}
