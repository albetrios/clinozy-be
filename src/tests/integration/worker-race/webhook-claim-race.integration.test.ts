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

const RACING_CLAIM_COUNT = 10;

describe('Integration: webhook delivery claim race', () => {
  const repository = new WebhookDeliveryAttemptRepository();

  beforeEach(async () => {
    await cleanupDatabase();
  });

  async function createAttemptFixture(options: { status: 'PENDING' | 'SENT' }) {
    const user = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: user.id });
    const webhook = await createTestWebhook({
      organizationId: organization.id,
      url: 'https://example.com/webhook-claim-race',
      events: ['webhook.test'],
      createdByUserId: user.id,
    });
    const deliveryAttempt = await createTestWebhookDeliveryAttempt({
      webhookId: webhook.id,
      payload: { race: true },
      status: options.status,
      attemptCount: options.status === 'SENT' ? 1 : 0,
    });
    return { organization, deliveryAttempt };
  }

  // Each claim runs inside its own JOB scope — the way `webhook-delivery.worker.ts` actually
  // claims. A context-free call would race a path production never takes, and under an
  // RLS-subject role it sees no row at all.
  function raceClaims(options: { organizationPublicId: string; deliveryAttemptId: number }) {
    return Promise.all(
      Array.from({ length: RACING_CLAIM_COUNT }, () =>
        withAppDatabaseContext({
          scope: PRINCIPAL_SCOPE.JOB({ organizationPublicId: options.organizationPublicId }),
          callback: () => repository.tryMarkSending(options.deliveryAttemptId),
        }),
      ),
    );
  }

  async function readAttempt(deliveryAttemptId: number) {
    const [row] = await getOperatorDatabase()
      .select({
        status: webhook_delivery_attempts.status,
        attempt_count: webhook_delivery_attempts.attempt_count,
      })
      .from(webhook_delivery_attempts)
      .where(eq(webhook_delivery_attempts.id, deliveryAttemptId));
    return row;
  }

  it('counts every racing claim — the attempt counter never loses an update', async () => {
    const { organization, deliveryAttempt } = await createAttemptFixture({ status: 'PENDING' });

    const claimResults = await raceClaims({
      organizationPublicId: organization.public_id,
      deliveryAttemptId: deliveryAttempt.id,
    });

    expect(claimResults.every((result) => result === 'claimed')).toBe(true);
    expect(await readAttempt(deliveryAttempt.id)).toEqual({
      status: 'SENDING',
      attempt_count: RACING_CLAIM_COUNT,
    });
  });

  it('no racing execution claims an attempt that is already SENT', async () => {
    const { organization, deliveryAttempt } = await createAttemptFixture({ status: 'SENT' });

    const claimResults = await raceClaims({
      organizationPublicId: organization.public_id,
      deliveryAttemptId: deliveryAttempt.id,
    });

    expect(claimResults.every((result) => result === 'already_sent')).toBe(true);
    expect(await readAttempt(deliveryAttempt.id)).toEqual({ status: 'SENT', attempt_count: 1 });
  });
});
