import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { database } from '@/infrastructure/database/connection.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { stripe_webhook_events } from '@/domains/billing/sub-domains/stripe-webhook/stripe-webhook.schema.js';
import { StripeWebhookEventRepository } from '@/domains/billing/sub-domains/stripe-webhook/stripe-webhook-event.repository.js';
import { STRIPE_WEBHOOK_MAX_PROCESSING_ATTEMPTS } from '@/shared/constants/billing.constants.js';

/**
 * A Stripe event is retried by the reclaim sweep until it is processed — or abandoned, after
 * STRIPE_WEBHOOK_MAX_PROCESSING_ATTEMPTS processing attempts (or at once for a failure no retry
 * fixes). An abandoned row is never reclaimed; an operator retry gives it a fresh budget.
 */
describe('StripeWebhookEventRepository — attempt cap and abandonment (database)', () => {
  const repository = new StripeWebhookEventRepository();

  beforeEach(async () => {
    await cleanupDatabase();
  });

  async function seedEvent(options: {
    stripeEventId: string;
    status: 'processing' | 'failed' | 'processed' | 'abandoned';
    attemptCount: number;
    updatedAt?: Date;
  }) {
    await database.insert(stripe_webhook_events).values({
      stripe_event_id: options.stripeEventId,
      event_type: 'customer.subscription.updated',
      stripe_created_at: new Date('2026-01-15T12:00:00.000Z'),
      processing_status: options.status,
      attempt_count: options.attemptCount,
      failure_reason: options.status === 'failed' ? 'handler failed' : null,
      ...(options.updatedAt ? { updated_at: options.updatedAt } : {}),
    });
  }

  async function readEvent(stripeEventId: string) {
    const [row] = await database
      .select()
      .from(stripe_webhook_events)
      .where(eq(stripe_webhook_events.stripe_event_id, stripeEventId));
    return row;
  }

  it('markFailed returns the attempt count the caller compares with the cap', async () => {
    await seedEvent({ stripeEventId: 'evt_count', status: 'processing', attemptCount: 7 });

    expect(await repository.markFailed('evt_count', 'boom')).toEqual({ attemptCount: 7 });
    expect(await repository.markFailed('evt_missing', 'boom')).toBeNull();
  });

  it('never reclaims a failed row that used every attempt', async () => {
    await seedEvent({
      stripeEventId: 'evt_capped',
      status: 'failed',
      attemptCount: STRIPE_WEBHOOK_MAX_PROCESSING_ATTEMPTS,
    });
    await seedEvent({ stripeEventId: 'evt_retryable', status: 'failed', attemptCount: 3 });

    expect(await repository.tryReclaimEvent('evt_capped')).toBe(false);
    expect(await repository.findReclaimableStripeEventIds(10)).toEqual(['evt_retryable']);
  });

  it('abandonExhaustedEvents abandons capped failed and stale-processing rows, and only those', async () => {
    const pastTheLease = new Date(Date.now() - 60 * 60_000);
    await seedEvent({
      stripeEventId: 'evt_capped_failed',
      status: 'failed',
      attemptCount: STRIPE_WEBHOOK_MAX_PROCESSING_ATTEMPTS,
    });
    await seedEvent({
      stripeEventId: 'evt_capped_crash_loop',
      status: 'processing',
      attemptCount: STRIPE_WEBHOOK_MAX_PROCESSING_ATTEMPTS + 2,
      updatedAt: pastTheLease,
    });
    await seedEvent({ stripeEventId: 'evt_still_retrying', status: 'failed', attemptCount: 2 });
    await seedEvent({
      stripeEventId: 'evt_processed',
      status: 'processed',
      attemptCount: STRIPE_WEBHOOK_MAX_PROCESSING_ATTEMPTS,
    });

    const abandoned = await repository.abandonExhaustedEvents(10);

    expect(abandoned.map((row) => row.stripe_event_id).sort()).toEqual([
      'evt_capped_crash_loop',
      'evt_capped_failed',
    ]);
    expect((await readEvent('evt_capped_failed'))?.processing_status).toBe('abandoned');
    expect((await readEvent('evt_still_retrying'))?.processing_status).toBe('failed');
    expect((await readEvent('evt_processed'))?.processing_status).toBe('processed');
    // Abandoned rows leave the reclaim scan for good.
    expect(await repository.findReclaimableStripeEventIds(10)).toEqual(['evt_still_retrying']);
    expect(await repository.abandonExhaustedEvents(10)).toEqual([]);
  });

  it('tryClaimEvent reports an abandoned event instead of reclaiming it', async () => {
    await seedEvent({ stripeEventId: 'evt_abandoned', status: 'abandoned', attemptCount: 25 });

    const claim = await repository.tryClaimEvent({
      stripe_event_id: 'evt_abandoned',
      event_type: 'customer.subscription.updated',
      stripe_created_at: new Date('2026-01-15T12:00:00.000Z'),
    });

    expect(claim).toBe('abandoned');
    expect((await readEvent('evt_abandoned'))?.attempt_count).toBe(25);
  });

  it('markAbandoned records the reason and never touches a processed row', async () => {
    await seedEvent({ stripeEventId: 'evt_permanent', status: 'processing', attemptCount: 1 });
    await seedEvent({ stripeEventId: 'evt_done', status: 'processed', attemptCount: 1 });

    expect(await repository.markAbandoned('evt_permanent', 'mismatched organization')).toBe(true);
    expect(await repository.markAbandoned('evt_done', 'late')).toBe(false);

    const permanent = await readEvent('evt_permanent');
    expect(permanent?.processing_status).toBe('abandoned');
    expect(permanent?.failure_reason).toBe('mismatched organization');
    expect((await readEvent('evt_done'))?.processing_status).toBe('processed');
  });

  it('resetForOperatorRetry gives an abandoned or failed event a fresh budget, nothing else', async () => {
    await seedEvent({ stripeEventId: 'evt_abandoned', status: 'abandoned', attemptCount: 25 });
    await seedEvent({ stripeEventId: 'evt_processed', status: 'processed', attemptCount: 1 });

    expect(await repository.resetForOperatorRetry('evt_abandoned')).toBe(true);
    expect(await repository.resetForOperatorRetry('evt_processed')).toBe(false);

    const reset = await readEvent('evt_abandoned');
    expect(reset?.processing_status).toBe('failed');
    expect(reset?.attempt_count).toBe(0);
    // Back in the reclaim scan, and the next claim reclaims it.
    expect(await repository.findReclaimableStripeEventIds(10)).toEqual(['evt_abandoned']);
    expect(await repository.tryReclaimEvent('evt_abandoned')).toBe(true);
  });
});
