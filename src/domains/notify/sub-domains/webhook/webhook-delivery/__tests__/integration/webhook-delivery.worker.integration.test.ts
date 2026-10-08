import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Queue, QueueEvents } from 'bullmq';
import { eq } from 'drizzle-orm';

import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import {
  webhook_delivery_attempts,
  webhooks,
} from '@/domains/notify/sub-domains/webhook/webhook.schema.js';
import {
  createWebhookDeliveryWorker,
  processWebhookDeliveryAttempt,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery.worker.js';
import {
  WEBHOOK_DELIVERY_QUEUE_NAME,
  type WebhookDeliveryJobData,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import type { WorkerHandle } from '@/infrastructure/queue/bootstrap.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import {
  createTestWebhook,
  createTestWebhookDeliveryAttempt,
} from '@/tests/factories/webhook.factory.js';

vi.mock('@/shared/utils/security/webhook-url.util.js', () => ({
  validateWebhookUrl: vi.fn().mockResolvedValue(undefined),
}));

async function readAttempt(deliveryAttemptId: number) {
  const [row] = await getOperatorDatabase()
    .select()
    .from(webhook_delivery_attempts)
    .where(eq(webhook_delivery_attempts.id, deliveryAttemptId));
  return row;
}

async function createDeliveryFixture(urlSuffix: string) {
  const user = await createTestUser();
  const organization = await createTestOrganization({ ownerUserId: user.id });
  const webhook = await createTestWebhook({
    organizationId: organization.id,
    url: `https://example.com/${urlSuffix}`,
    events: ['webhook.test'],
    createdByUserId: user.id,
  });
  const deliveryAttempt = await createTestWebhookDeliveryAttempt({ webhookId: webhook.id });
  return { user, organization, webhook, deliveryAttempt };
}

/**
 * End-to-end check for the webhook delivery worker. Without this, a CHECK
 * constraint mismatch (allowed statuses vs. statuses written by the worker)
 * went undetected and surfaced only in production / chaos runs.
 */
describe('webhook-delivery.worker — status transitions', () => {
  let workerHandle: WorkerHandle | null = null;
  let queue: Queue<WebhookDeliveryJobData> | null = null;
  let queueEvents: QueueEvents | null = null;

  beforeAll(async () => {
    workerHandle = createWebhookDeliveryWorker();
    queue = new Queue<WebhookDeliveryJobData>(WEBHOOK_DELIVERY_QUEUE_NAME, {
      connection: getBullMQConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
      defaultJobOptions: {
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 20 },
      },
    });
    queueEvents = new QueueEvents(WEBHOOK_DELIVERY_QUEUE_NAME, {
      connection: getBullMQConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
    });
    await queueEvents.waitUntilReady();
    await workerHandle.worker?.waitUntilReady();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await workerHandle?.close();
    await queue?.close();
    await queueEvents?.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('records SENT after a successful delivery and counts the attempt', async () => {
    const { organization, deliveryAttempt } = await createDeliveryFixture('delivery-success');
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const result = await processWebhookDeliveryAttempt({
      deliveryAttemptPublicId: deliveryAttempt.publicId,
      organizationPublicId: organization.public_id,
      destinationHost: 'example.com:443',
      jobContext: { id: 'unit-test', attemptsMade: 0 },
      fetchImplementation: fetchMock,
    });

    expect(result).toEqual({ outcome: 'delivered', httpStatus: 200 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const row = await readAttempt(deliveryAttempt.id);
    expect(row?.status).toBe('SENT');
    expect(row?.http_status_code).toBe(200);
    expect(row?.attempt_count).toBe(1);
  });

  it('records FAILED with the next retry time when the destination returns a non-2xx response', async () => {
    const { organization, deliveryAttempt } = await createDeliveryFixture('delivery-failure');
    const fetchMock = vi.fn(async () => new Response('upstream rejected', { status: 500 }));

    await expect(
      processWebhookDeliveryAttempt({
        deliveryAttemptPublicId: deliveryAttempt.publicId,
        organizationPublicId: organization.public_id,
        destinationHost: 'example.com:443',
        jobContext: { id: `wh-test-failure-${randomUUID()}`, attemptsMade: 0 },
        fetchImplementation: fetchMock,
      }),
    ).rejects.toThrow(/HTTP 500/);

    expect(fetchMock).toHaveBeenCalledOnce();
    const row = await readAttempt(deliveryAttempt.id);
    expect(row?.status).toBe('FAILED');
    expect(row?.http_status_code).toBe(500);
    // First of eight attempts failed: the next one is a minute out (the backoff adds jitter on top).
    expect(row?.next_retry_at).toBeInstanceOf(Date);
    expect(row!.next_retry_at!.getTime()).toBeGreaterThan(Date.now() + 50_000);
  });

  it('the next attempt of the job re-claims its FAILED row and delivers it', async () => {
    const { organization, deliveryAttempt } = await createDeliveryFixture('delivery-retry');

    await expect(
      processWebhookDeliveryAttempt({
        deliveryAttemptPublicId: deliveryAttempt.publicId,
        organizationPublicId: organization.public_id,
        destinationHost: 'example.com:443',
        jobContext: { id: 'retry-job', attemptsMade: 0 },
        fetchImplementation: vi.fn(async () => new Response('busy', { status: 503 })),
      }),
    ).rejects.toThrow(/HTTP 503/);

    const result = await processWebhookDeliveryAttempt({
      deliveryAttemptPublicId: deliveryAttempt.publicId,
      organizationPublicId: organization.public_id,
      destinationHost: 'example.com:443',
      jobContext: { id: 'retry-job', attemptsMade: 1 },
      fetchImplementation: vi.fn(async () => new Response('ok', { status: 200 })),
    });

    expect(result).toEqual({ outcome: 'delivered', httpStatus: 200 });
    const row = await readAttempt(deliveryAttempt.id);
    expect(row?.status).toBe('SENT');
    expect(row?.attempt_count).toBe(2);
    expect(row?.next_retry_at).toBeNull();
  });

  it('never POSTs a SENT attempt again — a duplicate job completes as already_sent', async () => {
    const { organization, deliveryAttempt } = await createDeliveryFixture('delivery-duplicate');
    await processWebhookDeliveryAttempt({
      deliveryAttemptPublicId: deliveryAttempt.publicId,
      organizationPublicId: organization.public_id,
      destinationHost: 'example.com:443',
      jobContext: { id: 'first-job', attemptsMade: 0 },
      fetchImplementation: vi.fn(async () => new Response('ok', { status: 200 })),
    });

    const duplicateFetch = vi.fn(async () => new Response('ok', { status: 200 }));
    const result = await processWebhookDeliveryAttempt({
      deliveryAttemptPublicId: deliveryAttempt.publicId,
      organizationPublicId: organization.public_id,
      destinationHost: 'example.com:443',
      jobContext: { id: 'duplicate-job', attemptsMade: 0 },
      fetchImplementation: duplicateFetch,
    });

    expect(result).toEqual({ outcome: 'skipped', reason: 'already_sent' });
    expect(duplicateFetch).not.toHaveBeenCalled();
    expect((await readAttempt(deliveryAttempt.id))?.attempt_count).toBe(1);
  });

  it('410 Gone fails the attempt for good and turns the webhook off', async () => {
    const { organization, webhook, deliveryAttempt } = await createDeliveryFixture('delivery-gone');

    const result = await processWebhookDeliveryAttempt({
      deliveryAttemptPublicId: deliveryAttempt.publicId,
      organizationPublicId: organization.public_id,
      destinationHost: 'example.com:443',
      jobContext: { id: 'gone-job', attemptsMade: 0 },
      fetchImplementation: vi.fn(async () => new Response('gone', { status: 410 })),
    });

    // Completes (no throw): retrying an endpoint that said it is gone only repeats the 410.
    expect(result).toEqual({ outcome: 'endpoint_gone', httpStatus: 410 });
    const row = await readAttempt(deliveryAttempt.id);
    expect(row?.status).toBe('FAILED');
    expect(row?.http_status_code).toBe(410);
    expect(row?.next_retry_at).toBeNull();
    const [webhookRow] = await getOperatorDatabase()
      .select({ is_enabled: webhooks.is_enabled })
      .from(webhooks)
      .where(eq(webhooks.id, webhook.id));
    expect(webhookRow?.is_enabled).toBe(false);
  });

  it('emits a failed queue event when BullMQ delivery exhausts attempts', async () => {
    const { organization, deliveryAttempt } = await createDeliveryFixture('delivery-failure-queue');
    const queueReference = queue;
    const queueEventsReference = queueEvents;
    if (!(queueReference && queueEventsReference)) {
      throw new Error('queue or queueEvents was not initialized');
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream rejected', { status: 500 })),
    );
    const jobId = deliveryAttempt.publicId;
    const failure = waitForJobFailure(queueEventsReference, jobId);

    await queueReference.add(
      'deliver-webhook',
      {
        deliveryAttemptPublicId: deliveryAttempt.publicId,
        organizationPublicId: organization.public_id,
        destinationHost: 'example.com:443',
      },
      { jobId, attempts: 1 },
    );

    await failure;
    vi.unstubAllGlobals();
    expect((await readAttempt(deliveryAttempt.id))?.status).toBe('FAILED');
  });

  it('does not load a delivery attempt under another organization context', async () => {
    const user = await createTestUser();
    const organizationA = await createTestOrganization({
      ownerUserId: user.id,
      slug: `org-a-${randomUUID().slice(0, 8)}`,
    });
    const organizationB = await createTestOrganization({
      ownerUserId: user.id,
      slug: `org-b-${randomUUID().slice(0, 8)}`,
    });
    const webhook = await createTestWebhook({
      organizationId: organizationA.id,
      url: 'https://example.com/webhook-tenant-isolation',
      events: ['webhook.test'],
      createdByUserId: user.id,
    });
    const deliveryAttempt = await createTestWebhookDeliveryAttempt({
      webhookId: webhook.id,
      payload: { tenant: 'isolation' },
    });

    await expect(
      processWebhookDeliveryAttempt({
        deliveryAttemptPublicId: deliveryAttempt.publicId,
        organizationPublicId: organizationB.public_id,
        destinationHost: 'example.com:443',
        jobContext: { id: 'tenant-isolation', attemptsMade: 0 },
        fetchImplementation: vi.fn(async () => new Response('ok', { status: 200 })),
      }),
    ).rejects.toThrow(/attempt_not_found/);
    expect((await readAttempt(deliveryAttempt.id))?.status).toBe('PENDING');
  });
});

function waitForJobFailure(queueEvents: QueueEvents, expectedJobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onFailed = (payload: { jobId: string }) => {
      if (payload.jobId !== expectedJobId) return;
      queueEvents.off('failed', onFailed);
      resolve();
    };
    queueEvents.on('failed', onFailed);
    setTimeout(() => reject(new Error(`timeout waiting for job ${expectedJobId}`)), 15_000);
  });
}
