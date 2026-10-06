import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { webhook_delivery_attempts } from '@/domains/notify/sub-domains/webhook/webhook.schema.js';
import {
  processWebhookDeliveryAttempt,
  type WebhookDeliveryFetch,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery.worker.js';
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

const PARALLEL_EXECUTION_COUNT = 10;

/**
 * Delivery is at-least-once: BullMQ runs one execution of a job at a time, but an execution that
 * lost its lock (a stalled worker) can overlap the one that replaced it. What must hold is that
 * every POST of one attempt carries the same `X-Webhook-Delivery-Id` (receivers dedupe on it) and
 * that nothing POSTs an attempt once it is `SENT`.
 */
describe('Integration: webhook-delivery worker concurrency race', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  async function createDeliveryFixture(urlSuffix: string) {
    const user = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: user.id });
    const webhook = await createTestWebhook({
      organizationId: organization.id,
      url: `https://example.com/${urlSuffix}`,
      events: ['webhook.test'],
      createdByUserId: user.id,
    });
    const deliveryAttempt = await createTestWebhookDeliveryAttempt({
      webhookId: webhook.id,
      payload: { race: true },
    });
    return { organization, deliveryAttempt };
  }

  function createRecordingFetch() {
    const deliveryIds: string[] = [];
    const fetchMock = vi.fn<WebhookDeliveryFetch>(async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      deliveryIds.push(headers['X-Webhook-Delivery-Id'] ?? '');
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    return { fetchMock, deliveryIds };
  }

  it('overlapping executions all send the same delivery id, and the attempt ends SENT', async () => {
    const { organization, deliveryAttempt } = await createDeliveryFixture('delivery-race');
    const { fetchMock, deliveryIds } = createRecordingFetch();

    const results = await Promise.allSettled(
      Array.from({ length: PARALLEL_EXECUTION_COUNT }, (_, index) =>
        processWebhookDeliveryAttempt({
          deliveryAttemptPublicId: deliveryAttempt.publicId,
          organizationPublicId: organization.public_id,
          jobContext: { id: `job-race-${String(index)}`, attemptsMade: 0 },
          fetchImplementation: fetchMock,
        }),
      ),
    );

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(deliveryIds.length).toBeGreaterThanOrEqual(1);
    expect(new Set(deliveryIds)).toEqual(new Set([deliveryAttempt.publicId]));

    const [row] = await getOperatorDatabase()
      .select()
      .from(webhook_delivery_attempts)
      .where(eq(webhook_delivery_attempts.id, deliveryAttempt.id));
    expect(row?.status).toBe('SENT');
    expect(row?.http_status_code).toBe(200);
    // Every execution that POSTed claimed (and counted) first; the rest found the row SENT.
    expect(row?.attempt_count).toBe(deliveryIds.length);
  });

  it('once one execution has delivered, no later execution POSTs', async () => {
    const { organization, deliveryAttempt } = await createDeliveryFixture('delivery-race-sent');
    const { fetchMock } = createRecordingFetch();
    await processWebhookDeliveryAttempt({
      deliveryAttemptPublicId: deliveryAttempt.publicId,
      organizationPublicId: organization.public_id,
      jobContext: { id: 'job-first', attemptsMade: 0 },
      fetchImplementation: fetchMock,
    });

    const results = await Promise.all(
      Array.from({ length: PARALLEL_EXECUTION_COUNT }, (_, index) =>
        processWebhookDeliveryAttempt({
          deliveryAttemptPublicId: deliveryAttempt.publicId,
          organizationPublicId: organization.public_id,
          jobContext: { id: `job-late-${String(index)}`, attemptsMade: 0 },
          fetchImplementation: fetchMock,
        }),
      ),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(
      results.every((result) => result.outcome === 'skipped' && result.reason === 'already_sent'),
    ).toBe(true);
  });
});
