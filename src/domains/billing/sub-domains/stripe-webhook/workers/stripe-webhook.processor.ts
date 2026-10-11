import type Stripe from 'stripe';
import { UnrecoverableError } from 'bullmq';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import { retrieveStripeEvent } from '@/infrastructure/payment/stripe.client.js';
import { isStripeResourceMissing } from '@/infrastructure/payment/stripe-error.util.js';
import type { StripeWebhookService } from '@/domains/billing/sub-domains/stripe-webhook/stripe-webhook.service.js';
import type { StripeWebhookJobData } from '@/domains/billing/sub-domains/stripe-webhook/queues/stripe-webhook.queue.js';
import { StripeWebhookEventAbandonedError } from '@/domains/billing/sub-domains/stripe-webhook/stripe-webhook.types.js';

/**
 * Worker entry point for jobs on the `stripe-webhook` queue: accepts the
 * pre-validated Redis payload, refetches the full event from Stripe by id, and
 * delegates to {@link StripeWebhookService.handleEvent} for idempotent
 * processing.
 *
 * @remarks
 * - **Algorithm:** Only the `stripeEventId` is persisted in Redis, so the
 *   processor reaches back to Stripe via {@link retrieveStripeEvent} to obtain
 *   the verified canonical event before invoking the service. The service then
 *   owns ledger claim, organization context, and dispatch.
 * - **Failure modes:** an event Stripe answers `resource_missing` for is abandoned on the ledger
 *   and the job fails with `UnrecoverableError` — no retry can fetch it (recorded and alerted
 *   once). So does an event the service abandoned ({@link StripeWebhookEventAbandonedError}).
 *   Other Stripe API failures and service errors propagate so BullMQ honours its retry/backoff
 *   (`stripeWebhookBackoffStrategy`); a handler failure the ledger will reclaim is marked
 *   `expectedFinalFailure` (no page when this job's attempts run out).
 * - **Side effects:** One Stripe API call per attempt; downstream service may
 *   write to ledger and subscription tables.
 * - **Notes:** Re-fetching keeps Redis payloads small and ensures every retry
 *   sees the current Stripe representation of the event.
 */
export async function processStripeWebhookJob(
  jobData: StripeWebhookJobData,
  stripeWebhookService: StripeWebhookService,
  jobId?: string,
): Promise<void> {
  // sec-r4-Q1: jobData is already validated by parseJobDataOrDeadLetter at the
  // worker boundary (stripe-webhook.worker.ts). Re-parsing here was redundant
  // and would bypass the dead-letter path for invalid payloads.
  const { stripeEventId, requestId } = jobData;

  let eventPayload: Stripe.Event;
  try {
    eventPayload = await retrieveStripeEvent(stripeEventId);
  } catch (error) {
    if (!isStripeResourceMissing(error)) throw error;
    await stripeWebhookService.abandonEvent({
      stripeEventId,
      failureReason: 'stripe_event_not_found',
    });
    throw new UnrecoverableError(`stripe.webhook.event_not_found:${stripeEventId}`);
  }

  logger.info(
    { jobId, stripeEventId, eventType: eventPayload.type, requestId },
    'stripe.webhook.worker.processing',
  );

  try {
    await stripeWebhookService.handleEvent({
      event: eventPayload,
      context: omitUndefined({ requestId }),
    });
  } catch (error) {
    if (error instanceof StripeWebhookEventAbandonedError) {
      throw new UnrecoverableError(error.message);
    }
    throw error;
  }
}
