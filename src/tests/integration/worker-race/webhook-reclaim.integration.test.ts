import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { webhook_delivery_attempts } from '@/domains/notify/sub-domains/webhook/webhook.schema.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { WebhookDeliveryAttemptRepository } from '@/domains/notify/sub-domains/webhook/webhook-delivery/webhook-delivery-attempt.repository.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import {
  createTestWebhook,
  createTestWebhookDeliveryAttempt,
} from '@/tests/factories/webhook.factory.js';

/**
 * BullMQ runs one execution of a job at a time and the job id is the attempt's public id, so an
 * execution that finds its row `SENDING` is looking at one that crashed or lost its lock mid-send.
 * The claim must take the row back: the old lease reported such a row as "in flight", the job
 * completed, and the event was never delivered.
 */
describe('Integration: webhook delivery re-claim', () => {
  const repository = new WebhookDeliveryAttemptRepository();

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('a new execution re-claims the SENDING row a crashed execution left behind', async () => {
    const user = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: user.id });
    const webhook = await createTestWebhook({
      organizationId: organization.id,
      url: 'https://example.com/webhook-reclaim',
      events: ['webhook.test'],
      createdByUserId: user.id,
    });
    const deliveryAttempt = await createTestWebhookDeliveryAttempt({
      webhookId: webhook.id,
      payload: { reclaim: true },
    });
    const claimUnderJobScope = () =>
      withAppDatabaseContext(
        PRINCIPAL_SCOPE.JOB({ organizationPublicId: organization.public_id }),
        () => repository.tryMarkSending(deliveryAttempt.id),
      );

    // The first execution claims and dies before recording an outcome; the next one — no wait,
    // no lease to run out — claims the same row straight away.
    expect(await claimUnderJobScope()).toBe('claimed');
    expect(await claimUnderJobScope()).toBe('claimed');

    const [row] = await getOperatorDatabase()
      .select({
        status: webhook_delivery_attempts.status,
        attempt_count: webhook_delivery_attempts.attempt_count,
      })
      .from(webhook_delivery_attempts)
      .where(eq(webhook_delivery_attempts.id, deliveryAttempt.id));

    expect(row?.status).toBe('SENDING');
    expect(row?.attempt_count).toBe(2);
  });
});
