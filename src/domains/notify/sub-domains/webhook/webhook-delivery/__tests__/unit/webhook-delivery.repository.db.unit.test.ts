import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { webhook_delivery_attempts } from '@/domains/notify/sub-domains/webhook/webhook.schema.js';
import { WebhookRepository } from '@/domains/notify/sub-domains/webhook/webhook.repository.js';
import {
  runWithWorkerDatabaseContext,
  WorkerDatabaseContextError,
} from '@/infrastructure/database/contexts/database-context-runtime.js';
import {
  runGlobalRetentionWorkerJob,
  type WorkerDatabaseHandle,
} from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import {
  createPendingWebhookDeliveryAttempt,
  disableWebhookAfterEndpointGone,
  findOrganizationPublicIdByDeliveryAttemptPublicId,
  findOrganizationPublicIdByWebhookId,
  findStalePendingDeliveryAttempts,
  findWebhookDeliveryAttemptWithWebhook,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/webhook-delivery.repository.js';

describe('webhook-delivery.repository (database)', () => {
  const webhookRepository = new WebhookRepository();
  const originalRuntime = process.env.CLINOZY_BE_RUNTIME;

  beforeEach(async () => {
    await cleanupDatabase();
  });

  afterEach(() => {
    if (originalRuntime === undefined) {
      delete process.env.CLINOZY_BE_RUNTIME;
    } else {
      process.env.CLINOZY_BE_RUNTIME = originalRuntime;
    }
  });

  async function createWebhookForNewOrganization(urlSuffix: string) {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const webhook = await webhookRepository.create({
      organization_id: organization.id,
      url: `https://example.com/${urlSuffix}`,
      events: ['subscription.updated'],
      encrypted_secret: `sample-webhook-secret-${urlSuffix}`,
      created_by_user_id: owner.id,
    });
    return { organization, webhook };
  }

  /** A delivery attempt created `createdMinutesAgo` minutes ago, in `status` (PENDING by default). */
  async function createAttemptAged(options: {
    webhookId: number;
    createdMinutesAgo: number;
    status?: 'SENDING' | 'SENT';
  }): Promise<string> {
    const attempt = await createPendingWebhookDeliveryAttempt({
      webhookId: options.webhookId,
      eventType: 'subscription.updated',
      payload: {},
    });
    await getOperatorDatabase()
      .update(webhook_delivery_attempts)
      .set({
        created_at: new Date(Date.now() - options.createdMinutesAgo * 60_000),
        ...(options.status ? { status: options.status } : {}),
      })
      .where(eq(webhook_delivery_attempts.public_id, attempt!.publicId));
    return attempt!.publicId;
  }

  it('resolves organization by webhook and delivery attempt ids', async () => {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const webhook = await webhookRepository.create({
      organization_id: organization.id,
      url: 'https://example.com/webhooks',
      events: ['subscription.updated'],
      encrypted_secret: 'sample-webhook-secret-primary',
      created_by_user_id: owner.id,
    });

    const organizationByWebhook = await findOrganizationPublicIdByWebhookId(webhook.id);
    expect(organizationByWebhook).toBe(organization.public_id);

    const deliveryAttempt = await createPendingWebhookDeliveryAttempt({
      webhookId: webhook.id,
      eventType: 'subscription.updated',
      payload: { subscription_id: 'sub_1' },
    });
    // The public id is the BullMQ job id and the job payload — the only handle the creator returns.
    expect(deliveryAttempt).toEqual({ publicId: expect.stringMatching(/^wda_[a-z0-9]{21}$/) });

    const organizationByAttempt = await findOrganizationPublicIdByDeliveryAttemptPublicId(
      deliveryAttempt!.publicId,
    );
    expect(organizationByAttempt).toBe(organization.public_id);

    const delivery = await findWebhookDeliveryAttemptWithWebhook(
      deliveryAttempt!.publicId,
      organization.public_id,
    );
    expect(delivery?.webhookUrl).toBe('https://example.com/webhooks');
    expect(delivery?.eventType).toBe('subscription.updated');
    expect(delivery?.payload).toEqual({ subscription_id: 'sub_1' });
    expect(delivery?.deliveryAttemptPublicId).toBe(deliveryAttempt!.publicId);
    // Keys the outbound circuit breaker — the webhook's public id, not its bigserial.
    expect(delivery?.webhookPublicId).toBe(webhook.public_id);
  });

  it('findWebhookDeliveryAttemptWithWebhook returns null for wrong organization', async () => {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const webhook = await webhookRepository.create({
      organization_id: organization.id,
      url: 'https://example.com/other',
      events: ['subscription.updated'],
      encrypted_secret: 'sample-webhook-secret-secondary',
      created_by_user_id: owner.id,
    });

    const deliveryAttempt = await createPendingWebhookDeliveryAttempt({
      webhookId: webhook.id,
      eventType: 'subscription.updated',
      payload: {},
    });

    const missing = await findWebhookDeliveryAttemptWithWebhook(
      deliveryAttempt!.publicId,
      'org_does_not_match',
    );
    expect(missing).toBeNull();
  });

  it('findOrganizationPublicIdByWebhookId returns null when webhook missing', async () => {
    const result = await findOrganizationPublicIdByWebhookId(999_999);
    expect(result).toBeNull();
  });

  it('findOrganizationPublicIdByDeliveryAttemptPublicId returns null when attempt missing', async () => {
    const result = await findOrganizationPublicIdByDeliveryAttemptPublicId(
      'wda_missingmissingmissing',
    );
    expect(result).toBeNull();
  });

  // The reclaim sweep's read. A delivery whose enqueue failed (Redis refused the write) or whose
  // process died between the commit and the enqueue sits PENDING with no job; before the sweep it
  // was marked FAILED and never sent.
  it('findStalePendingDeliveryAttempts finds attempts still PENDING past the cutoff in every organization, oldest first', async () => {
    const first = await createWebhookForNewOrganization('reclaim-first');
    const second = await createWebhookForNewOrganization('reclaim-second');
    const staleInFirst = await createAttemptAged({
      webhookId: first.webhook.id,
      createdMinutesAgo: 10,
    });
    // Fresh (its job is just starting), delivered, and claimed: none of them is the sweep's.
    await createAttemptAged({ webhookId: first.webhook.id, createdMinutesAgo: 1 });
    await createAttemptAged({ webhookId: first.webhook.id, createdMinutesAgo: 20, status: 'SENT' });
    await createAttemptAged({
      webhookId: first.webhook.id,
      createdMinutesAgo: 20,
      status: 'SENDING',
    });
    const staleInSecond = await createAttemptAged({
      webhookId: second.webhook.id,
      createdMinutesAgo: 30,
    });
    const createdBefore = new Date(Date.now() - 5 * 60_000);

    const found = await runGlobalRetentionWorkerJob((databaseHandle) =>
      findStalePendingDeliveryAttempts(databaseHandle, { createdBefore, limit: 10 }),
    );
    expect(found).toEqual([
      {
        deliveryAttemptPublicId: staleInSecond,
        organizationPublicId: second.organization.public_id,
      },
      {
        deliveryAttemptPublicId: staleInFirst,
        organizationPublicId: first.organization.public_id,
      },
    ]);

    const oldestOnly = await runGlobalRetentionWorkerJob((databaseHandle) =>
      findStalePendingDeliveryAttempts(databaseHandle, { createdBefore, limit: 1 }),
    );
    expect(oldestOnly.map((row) => row.deliveryAttemptPublicId)).toEqual([staleInSecond]);
  });

  it('findStalePendingDeliveryAttempts refuses an organization-scoped worker context, where RLS would hide every other tenant', async () => {
    process.env.CLINOZY_BE_RUNTIME = 'worker';
    await runWithWorkerDatabaseContext({ kind: 'organization' }, async () => {
      await expect(
        findStalePendingDeliveryAttempts({} as WorkerDatabaseHandle, {
          createdBefore: new Date(),
          limit: 1,
        }),
      ).rejects.toThrow(WorkerDatabaseContextError);
    });
  });

  it('disableWebhookAfterEndpointGone turns the webhook off (410 Gone from its endpoint)', async () => {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const webhook = await webhookRepository.create({
      organization_id: organization.id,
      url: 'https://example.com/gone',
      events: ['subscription.updated'],
      encrypted_secret: 'sample-webhook-secret-gone',
      created_by_user_id: owner.id,
    });

    await disableWebhookAfterEndpointGone(webhook.id);

    const reloaded = await webhookRepository.findByPublicId(webhook.public_id, organization.id);
    expect(reloaded?.is_enabled).toBe(false);
  });
});
