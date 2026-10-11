/**
 * Lists failed and abandoned Stripe webhook ledger rows and retries one on request.
 *
 * Usage:
 *   pnpm tool:stripe-webhook-replay -- --list
 *   pnpm tool:stripe-webhook-replay -- --retry evt_123 [--dry-run]
 *
 * `--retry` gives a `failed` or `abandoned` event a fresh attempt budget (`failed`,
 * `attempt_count` 0) and enqueues it; the worker claims it from there. The reclaim sweep retries
 * `failed` rows on its own — this is for an abandoned event once its cause is fixed.
 */
import '@/shared/config/load-env-files.js';
import { inArray } from 'drizzle-orm';
import { database, closeDatabase } from '@/infrastructure/database/connection.js';
import { connectRedis, closeRedis } from '@/infrastructure/cache/redis.client.js';
import { stripe_webhook_events } from '@/domains/billing/sub-domains/stripe-webhook/stripe-webhook.schema.js';
import { StripeWebhookEventRepository } from '@/domains/billing/sub-domains/stripe-webhook/stripe-webhook-event.repository.js';
import {
  closeStripeWebhookQueue,
  enqueueStripeWebhookByEventIdForReclaim,
} from '@/domains/billing/sub-domains/stripe-webhook/queues/stripe-webhook.queue.js';

const repository = new StripeWebhookEventRepository();

async function listUnprocessedEvents(): Promise<void> {
  const rows = await database
    .select({
      stripe_event_id: stripe_webhook_events.stripe_event_id,
      event_type: stripe_webhook_events.event_type,
      processing_status: stripe_webhook_events.processing_status,
      attempt_count: stripe_webhook_events.attempt_count,
      failure_reason: stripe_webhook_events.failure_reason,
    })
    .from(stripe_webhook_events)
    .where(inArray(stripe_webhook_events.processing_status, ['failed', 'abandoned']));

  if (rows.length === 0) {
    console.log('No failed or abandoned Stripe webhook events.');
    return;
  }

  for (const row of rows) {
    console.log(
      `${row.stripe_event_id}\t${row.event_type}\t${row.processing_status}\tattempts=${row.attempt_count}\t${row.failure_reason ?? ''}`,
    );
  }
  console.log(`Total: ${rows.length}`);
}

async function retryEvent({
  stripeEventId,
  dryRun,
}: {
  stripeEventId: string;
  dryRun: boolean;
}): Promise<void> {
  if (dryRun) {
    console.log(`[dry-run] Would reset and enqueue ${stripeEventId}`);
    return;
  }

  const reset = await repository.resetForOperatorRetry(stripeEventId);
  if (!reset) {
    console.error(`Cannot retry ${stripeEventId}: no failed or abandoned ledger row.`);
    process.exitCode = 1;
    return;
  }
  await connectRedis();
  await enqueueStripeWebhookByEventIdForReclaim({
    stripeEventId,
    requestId: 'stripe-webhook-replay',
  });
  console.log(`Reset and enqueued ${stripeEventId}.`);
}

async function main(): Promise<void> {
  const argumentsList = process.argv.slice(2);
  const dryRun = argumentsList.includes('--dry-run');

  if (argumentsList.includes('--list') || argumentsList.length === 0) {
    await listUnprocessedEvents();
    return;
  }

  const retryIndex = argumentsList.indexOf('--retry');
  const stripeEventId = retryIndex >= 0 ? argumentsList[retryIndex + 1] : undefined;
  if (!stripeEventId || stripeEventId.startsWith('--')) {
    console.error('Usage: pnpm tool:stripe-webhook-replay -- --list | --retry <id> [--dry-run]');
    process.exitCode = 1;
    return;
  }
  await retryEvent({ stripeEventId, dryRun });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeStripeWebhookQueue();
    await closeRedis();
    await closeDatabase();
  });
