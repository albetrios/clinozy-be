import { afterAll, describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import {
  STRIPE_WEBHOOK_QUEUE_NAME,
  closeStripeWebhookQueue,
  enqueueStripeWebhookByEventId,
  enqueueStripeWebhookByEventIdForReclaim,
} from '@/domains/billing/sub-domains/stripe-webhook/queues/stripe-webhook.queue.js';

/**
 * Against real BullMQ: a Stripe event has at most one live job. During a Stripe outage the event's
 * job sits parked while the reclaim sweep runs every five minutes — each sweep used to add another
 * job under a fresh id, thousands over a long outage, every one an `events.retrieve` once Stripe
 * was back.
 */
describe('Integration: Stripe webhook enqueue keeps one live job per event', () => {
  const inspector = new Queue(STRIPE_WEBHOOK_QUEUE_NAME, {
    connection: getBullMQConnectionOptions(),
    prefix: getBullMQKeyPrefix(),
  });

  afterAll(async () => {
    await closeStripeWebhookQueue();
    await inspector.close();
  });

  async function liveJobsFor(stripeEventId: string) {
    const jobs = await inspector.getJobs(['waiting', 'delayed', 'active', 'prioritized']);
    return jobs.filter((job) => job.data?.stripeEventId === stripeEventId);
  }

  it('ignores reclaim adds while the event still has a job, and accepts one after it is gone', async () => {
    const stripeEventId = `evt_dedupe_${Date.now()}`;

    await enqueueStripeWebhookByEventId({ stripeEventId, requestId: 'ingress' });
    await enqueueStripeWebhookByEventIdForReclaim({ stripeEventId, requestId: 'reclaim-sweep' });
    await enqueueStripeWebhookByEventIdForReclaim({ stripeEventId, requestId: 'reclaim-sweep' });

    const live = await liveJobsFor(stripeEventId);
    expect(live).toHaveLength(1);
    expect(live[0]?.data.requestId).toBe('ingress');

    // The job is gone (finished, or lost with Redis): the sweep can re-enqueue the event.
    await live[0]?.remove();
    await enqueueStripeWebhookByEventIdForReclaim({ stripeEventId, requestId: 'reclaim-sweep' });
    const again = await liveJobsFor(stripeEventId);
    expect(again).toHaveLength(1);
    expect(again[0]?.data.requestId).toBe('reclaim-sweep');

    await again[0]?.remove();
  });
});
