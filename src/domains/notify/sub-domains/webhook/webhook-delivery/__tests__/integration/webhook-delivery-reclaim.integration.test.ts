import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';

import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import {
  createTestWebhook,
  createTestWebhookDeliveryAttempt,
} from '@/tests/factories/webhook.factory.js';
import { webhook_delivery_attempts } from '@/domains/notify/sub-domains/webhook/webhook.schema.js';
import {
  WEBHOOK_DELIVERY_QUEUE_NAME,
  closeWebhookDeliveryQueue,
  type WebhookDeliveryJobData,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js';
import { runWebhookDeliveryReclaimJob } from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery-reclaim.processor.js';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';

/**
 * Against real Postgres and Redis: an outbound webhook delivery whose job was lost — the enqueue
 * failed while Redis refused writes, or the process died between the commit and the enqueue — is
 * handed back to the delivery queue by the reclaim sweep, once, under its own organization. Before
 * the sweep such an attempt was marked FAILED and the customer never received the event.
 */
describe('Integration: webhook delivery reclaim sweep', () => {
  const inspector = new Queue<WebhookDeliveryJobData>(WEBHOOK_DELIVERY_QUEUE_NAME, {
    connection: getBullMQConnectionOptions(),
    prefix: getBullMQKeyPrefix(),
  });

  afterAll(async () => {
    await closeWebhookDeliveryQueue();
    await inspector.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  async function createPendingAttempt(options: { createdMinutesAgo: number }) {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const webhook = await createTestWebhook({
      organizationId: organization.id,
      url: 'https://example.com/reclaim',
      events: ['webhook.test'],
      createdByUserId: owner.id,
    });
    const deliveryAttempt = await createTestWebhookDeliveryAttempt({ webhookId: webhook.id });
    await getOperatorDatabase()
      .update(webhook_delivery_attempts)
      .set({ created_at: new Date(Date.now() - options.createdMinutesAgo * 60_000) })
      .where(eq(webhook_delivery_attempts.id, deliveryAttempt.id));
    return { organization, deliveryAttempt };
  }

  async function jobsFor(deliveryAttemptPublicId: string) {
    const jobs = await inspector.getJobs(['waiting', 'delayed', 'active', 'prioritized']);
    return jobs.filter((job) => job.data?.deliveryAttemptPublicId === deliveryAttemptPublicId);
  }

  it('re-creates the lost job of an attempt left PENDING, and adds nothing while that job exists', async () => {
    const { organization, deliveryAttempt } = await createPendingAttempt({ createdMinutesAgo: 10 });
    expect(await jobsFor(deliveryAttempt.publicId)).toHaveLength(0);

    const firstSweep = await runWebhookDeliveryReclaimJob();

    expect(firstSweep).toEqual({ scannedCount: 1, addedCount: 1 });
    const [job] = await jobsFor(deliveryAttempt.publicId);
    expect(job?.id).toBe(deliveryAttempt.publicId);
    expect(job?.data).toMatchObject({
      deliveryAttemptPublicId: deliveryAttempt.publicId,
      organizationPublicId: organization.public_id,
      destinationHost: 'example.com:443',
      requestId: 'webhook-delivery-reclaim',
    });

    // The attempt is still PENDING (no worker ran it): the next sweep finds it again, and its add
    // is dropped because the job id — the attempt's public id — still exists. One job, the same one.
    await runWebhookDeliveryReclaimJob();
    const afterSecondSweep = await jobsFor(deliveryAttempt.publicId);
    expect(afterSecondSweep).toHaveLength(1);
    expect(afterSecondSweep[0]?.timestamp).toBe(job?.timestamp);

    await job?.remove();
  });

  it('leaves a fresh PENDING attempt alone — its own job is just starting', async () => {
    const { deliveryAttempt } = await createPendingAttempt({ createdMinutesAgo: 1 });

    const sweep = await runWebhookDeliveryReclaimJob();

    expect(sweep).toEqual({ scannedCount: 0, addedCount: 0 });
    expect(await jobsFor(deliveryAttempt.publicId)).toHaveLength(0);
  });
});
