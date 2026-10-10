import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Queue } from 'bullmq';
import { asc, eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import type { FastifyInstance } from 'fastify';
import { buildDomainEvent, eventBus } from '@/core/events/event-bus.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { webhook_delivery_attempts } from '@/domains/notify/sub-domains/webhook/webhook.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import {
  WEBHOOK_DELIVERY_QUEUE_NAME,
  closeWebhookDeliveryQueue,
  type WebhookDeliveryJobData,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js';
import { WEBHOOK_EVENT_TYPES } from '@/domains/notify/sub-domains/webhook/webhook-event/webhook-event.constants.js';
import { createTestSubscription } from '@/domains/billing/__tests__/factories/subscription.factory.js';
import {
  createMembership,
  createRoleWithPermissions,
  seedPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestPlan } from '@/tests/factories/plan.factory.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestWebhook } from '@/tests/factories/webhook.factory.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';

const fanOutFault = vi.hoisted(() => ({ enabled: false }));
// When enabled, the attempt insert first runs a statement Postgres rejects (division by zero): a
// real database failure inside the producer's transaction, not a JavaScript throw.
vi.mock(
  '@/domains/notify/sub-domains/webhook/webhook-delivery/webhook-delivery.repository.js',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/domains/notify/sub-domains/webhook/webhook-delivery/webhook-delivery.repository.js')
      >();
    return {
      ...actual,
      createPendingWebhookDeliveryAttempt: async (
        input: Parameters<typeof actual.createPendingWebhookDeliveryAttempt>[0],
      ) => {
        if (fanOutFault.enabled) {
          const { getRequestDatabase } = await import(
            '@/infrastructure/database/contexts/database-context-runtime.js'
          );
          const { sql } = await import('drizzle-orm');
          await getRequestDatabase().execute(sql`SELECT 1 / 0`);
        }
        return actual.createPendingWebhookDeliveryAttempt(input);
      },
    };
  },
);

vi.mock('@/domains/billing/sub-domains/subscription/stripe-payment-provider.js', () => {
  class FakeStripePaymentProvider {
    isConfigured(): boolean {
      return true;
    }
    getProviderPriceId(): string {
      return 'price_test_fake';
    }
    async createSubscription() {
      return {
        providerSubscriptionId: `sub_fake_${randomUUID()}`,
        providerCustomerId: `cus_fake_${randomUUID()}`,
      };
    }
    async cancelSubscriptionAtPeriodEnd(): Promise<void> {}
    async cancelSubscriptionImmediately(): Promise<void> {}
    async resumeSubscription(): Promise<void> {}
    async updateSubscriptionPrice(): Promise<void> {}
  }
  return { StripePaymentProvider: FakeStripePaymentProvider };
});

const PERMISSIONS = [
  'webhook:read',
  'webhook:manage',
  'organization:update',
  'membership:read',
  'membership:manage',
  'invitation:manage',
  'subscription:read',
  'subscription:manage',
];

type Envelope = { id: string; type: string; created_at: string; data: Record<string, unknown> };

/**
 * The 8 event types `GET /notify/webhook-events` advertises, end to end: the real HTTP write (or
 * the Stripe webhook dispatch) records a PENDING delivery attempt for each subscribed webhook in
 * the same transaction, carrying the `{ id, type, created_at, data }` envelope whose `data` is the
 * resource's public JSON, and the delivery job is enqueued once that transaction has committed.
 */
describe('Integration: organization resource events reach subscribed webhooks', () => {
  let app: FastifyInstance;
  const deliveryQueue = new Queue<WebhookDeliveryJobData>(WEBHOOK_DELIVERY_QUEUE_NAME, {
    connection: getBullMQConnectionOptions(),
    prefix: getBullMQKeyPrefix(),
  });

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    await closeWebhookDeliveryQueue();
    await deliveryQueue.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    await seedPermissions(PERMISSIONS);
  });

  async function createSubscribedOrganization(
    events: readonly string[] = WEBHOOK_EVENT_TYPES,
    permissionCodes: readonly string[] = PERMISSIONS,
  ) {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [...permissionCodes],
      createdByUserId: owner.id,
    });
    await createMembership({ userId: owner.id, organizationId: organization.id, roleId: role.id });
    const webhook = await createTestWebhook({
      organizationId: organization.id,
      url: 'https://example.com/events',
      events: [...events],
      createdByUserId: owner.id,
    });
    const token = await generateTestToken({
      userId: owner.public_id,
      organizationPublicId: organization.public_id,
    });
    return { owner, organization, role, webhook, token };
  }

  async function envelopes(webhookId: number, eventType: string): Promise<Envelope[]> {
    const rows = await getOperatorDatabase()
      .select()
      .from(webhook_delivery_attempts)
      .where(eq(webhook_delivery_attempts.webhook_id, webhookId))
      .orderBy(asc(webhook_delivery_attempts.id));
    for (const row of rows) expect(row.status).toBe('PENDING');
    return rows.filter((row) => row.event_type === eventType).map((row) => row.payload as Envelope);
  }

  async function queuedAttempt(webhookId: number, eventType: string) {
    const [row] = await getOperatorDatabase()
      .select({ public_id: webhook_delivery_attempts.public_id })
      .from(webhook_delivery_attempts)
      .where(eq(webhook_delivery_attempts.webhook_id, webhookId))
      .orderBy(asc(webhook_delivery_attempts.id));
    expect(row, eventType).toBeDefined();
    return deliveryQueue.getJob(row!.public_id);
  }

  function expectEnvelope(envelope: Envelope | undefined, type: string, dataId: string) {
    expect(envelope).toMatchObject({
      id: expect.stringMatching(/^evt_[a-z0-9]{21}$/),
      type,
      created_at: expect.any(String),
      data: expect.objectContaining({ id: dataId }),
    });
  }

  it('organization.updated carries the organization after the PATCH, and its job is queued', async () => {
    const { organization, webhook, token } = await createSubscribedOrganization();

    const response = await injectAuthenticated(app, {
      method: 'PATCH',
      url: testApiPath('/tenancy/organization'),
      token,
      payload: { name: 'Renamed Clinic' },
    });
    expect(response.statusCode, response.body).toBe(200);

    const [envelope] = await envelopes(webhook.id, 'organization.updated');
    expectEnvelope(envelope, 'organization.updated', organization.public_id);
    expect(envelope?.data).toEqual((response.json() as { data: unknown }).data);
    // The enqueue ran after the commit (the request's onResponse flush).
    expect(await queuedAttempt(webhook.id, 'organization.updated')).toBeDefined();
  });

  it('organization.created is emitted with the new organization (it has no webhooks yet)', async () => {
    const { token } = await createSubscribedOrganization();
    const emitSpy = vi.spyOn(eventBus, 'emit');
    try {
      const response = await injectAuthenticated(app, {
        method: 'POST',
        url: testApiPath('/tenancy/organizations'),
        token,
        headers: { 'x-idempotency-key': `organization-${randomUUID()}` },
        payload: { name: 'Second Clinic', slug: `second-clinic-${Date.now()}` },
      });
      expect(response.statusCode, response.body).toBe(200);
      const created = (response.json() as { data: { id: string } }).data;
      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'organization.created',
          payload: { organization_public_id: created.id, data: created },
        }),
      );
    } finally {
      emitSpy.mockRestore();
    }
  });

  it('membership.created, .updated and .deleted follow a member through add, suspend and remove', async () => {
    const { organization, role, webhook, token } = await createSubscribedOrganization();

    const added = await injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/tenancy/organization/memberships'),
      token,
      headers: { 'x-idempotency-key': `membership-${randomUUID()}` },
      payload: { email: `invitee-${randomUUID()}@example.com`, role_id: role.public_id },
    });
    expect(added.statusCode, added.body).toBe(200);
    const invited = (added.json() as { data: { id: string; status: string } }).data;
    const [createdEnvelope] = await envelopes(webhook.id, 'membership.created');
    expectEnvelope(createdEnvelope, 'membership.created', invited.id);
    expect(createdEnvelope?.data).toMatchObject({ status: 'INVITED' });

    const member = await createTestUser();
    const membership = await createMembership({
      userId: member.id,
      organizationId: organization.id,
      roleId: role.id,
    });
    const suspended = await injectAuthenticated(app, {
      method: 'PATCH',
      url: testApiPath(`/tenancy/organization/memberships/${membership.public_id}`),
      token,
      payload: { status: 'SUSPENDED' },
    });
    expect(suspended.statusCode, suspended.body).toBe(200);
    const [updatedEnvelope] = await envelopes(webhook.id, 'membership.updated');
    expectEnvelope(updatedEnvelope, 'membership.updated', membership.public_id);
    expect(updatedEnvelope?.data).toMatchObject({ status: 'SUSPENDED' });

    const removed = await injectAuthenticated(app, {
      method: 'DELETE',
      url: testApiPath(`/tenancy/organization/memberships/${membership.public_id}`),
      token,
    });
    expect(removed.statusCode, removed.body).toBe(204);
    const [deletedEnvelope] = await envelopes(webhook.id, 'membership.deleted');
    expectEnvelope(deletedEnvelope, 'membership.deleted', membership.public_id);
  });

  it('membership.deleted also fires when a pending invitation is revoked', async () => {
    const { role, webhook, token } = await createSubscribedOrganization();
    const added = await injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/tenancy/organization/memberships'),
      token,
      headers: { 'x-idempotency-key': `membership-${randomUUID()}` },
      payload: { email: `revoked-${randomUUID()}@example.com`, role_id: role.public_id },
    });
    expect(added.statusCode, added.body).toBe(200);
    const invited = (added.json() as { data: { id: string; invitation: { id: string } } }).data;

    const revoked = await injectAuthenticated(app, {
      method: 'DELETE',
      url: testApiPath(`/tenancy/organization/invitations/${invited.invitation.id}`),
      token,
    });
    expect(revoked.statusCode, revoked.body).toBe(204);
    const [deletedEnvelope] = await envelopes(webhook.id, 'membership.deleted');
    expectEnvelope(deletedEnvelope, 'membership.deleted', invited.id);
  });

  it('subscription.created and .updated follow create, cancel at period end and resume', async () => {
    const { webhook, token } = await createSubscribedOrganization();
    const plan = await createTestPlan();

    const created = await injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/billing/subscriptions'),
      token,
      headers: { 'x-idempotency-key': `subscription-${randomUUID()}` },
      payload: { plan_id: plan.public_id, billing_cycle: 'monthly' },
    });
    expect(created.statusCode, created.body).toBe(200);
    const subscription = (created.json() as { data: { id: string } }).data;
    const [createdEnvelope] = await envelopes(webhook.id, 'subscription.created');
    expectEnvelope(createdEnvelope, 'subscription.created', subscription.id);
    expect(createdEnvelope?.data).toMatchObject({ plan_id: plan.public_id });

    for (const action of ['cancel', 'resume'] as const) {
      const response = await injectAuthenticated(app, {
        method: 'POST',
        url: testApiPath(`/billing/subscriptions/${subscription.id}/${action}`),
        token,
        headers: { 'x-idempotency-key': `subscription-${action}-${randomUUID()}` },
        payload: {},
      });
      expect(response.statusCode, response.body).toBe(200);
    }
    const updates = await envelopes(webhook.id, 'subscription.updated');
    expect(updates.map((envelope) => envelope.data.cancel_at_period_end)).toEqual([true, false]);
    for (const envelope of updates)
      expectEnvelope(envelope, 'subscription.updated', subscription.id);
  });

  it('subscription.cancelled fires from the Stripe deletion, with its job queued after the commit', async () => {
    const { organization, webhook } = await createSubscribedOrganization();
    const plan = await createTestPlan();
    const providerSubscriptionId = `sub_deleted_${randomUUID()}`;
    const subscription = await createTestSubscription({
      organizationId: organization.id,
      planId: plan.id,
      providerSubscriptionId,
    });

    await app.billingDomain.stripeWebhookService.handleEvent({
      id: `evt_deleted_${randomUUID()}`,
      object: 'event',
      type: 'customer.subscription.deleted',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: providerSubscriptionId, object: 'subscription', items: { data: [] } } },
    } as unknown as Stripe.Event);

    const [envelope] = await envelopes(webhook.id, 'subscription.cancelled');
    expectEnvelope(envelope, 'subscription.cancelled', subscription.public_id);
    expect(envelope?.data).toMatchObject({ status: 'CANCELED' });
    expect(await queuedAttempt(webhook.id, 'subscription.cancelled')).toBeDefined();
  });

  it('delivers only to enabled webhooks subscribed to the type, one envelope shared by all of them', async () => {
    const { owner, organization, webhook, token } = await createSubscribedOrganization([
      'organization.updated',
    ]);
    const secondSubscriber = await createTestWebhook({
      organizationId: organization.id,
      url: 'https://example.com/second',
      events: ['organization.updated'],
      createdByUserId: owner.id,
    });
    const otherType = await createTestWebhook({
      organizationId: organization.id,
      url: 'https://example.com/other',
      events: ['membership.deleted'],
      createdByUserId: owner.id,
    });
    const disabled = await createTestWebhook({
      organizationId: organization.id,
      url: 'https://example.com/disabled',
      events: ['organization.updated'],
      isEnabled: false,
      createdByUserId: owner.id,
    });

    const response = await injectAuthenticated(app, {
      method: 'PATCH',
      url: testApiPath('/tenancy/organization'),
      token,
      payload: { name: 'Fan-out Clinic' },
    });
    expect(response.statusCode, response.body).toBe(200);

    const [first] = await envelopes(webhook.id, 'organization.updated');
    const [second] = await envelopes(secondSubscriber.id, 'organization.updated');
    expectEnvelope(first, 'organization.updated', organization.public_id);
    expect(second).toEqual(first);
    expect(await envelopes(otherType.id, 'organization.updated')).toEqual([]);
    expect(await envelopes(disabled.id, 'organization.updated')).toEqual([]);
  });

  it('records nothing when the producing write rolls back, because the attempt shares its transaction', async () => {
    const { organization, webhook } = await createSubscribedOrganization();

    await expect(
      withAppDatabaseContext(
        PRINCIPAL_SCOPE.VERIFIED({ organizationPublicId: organization.public_id }),
        async () => {
          await eventBus.emit(
            buildDomainEvent('organization.updated', {
              organization_public_id: organization.public_id,
              data: { id: organization.public_id },
            }),
          );
          throw new Error('write failed after the event');
        },
      ),
    ).rejects.toThrow('write failed after the event');

    expect(await envelopes(webhook.id, 'organization.updated')).toEqual([]);
    // Nor is a delivery job queued: the rolled-back unit's after-commit tasks are dropped.
    const jobs = await deliveryQueue.getJobs(['waiting', 'delayed', 'active', 'prioritized']);
    expect(jobs.filter((job) => job.data?.organizationPublicId === organization.public_id)).toEqual(
      [],
    );
  });

  it('a failed statement inside the fan-out records no attempt and leaves the write committed', async () => {
    const { organization, webhook, token } = await createSubscribedOrganization();
    fanOutFault.enabled = true;
    try {
      const response = await injectAuthenticated(app, {
        method: 'PATCH',
        url: testApiPath('/tenancy/organization'),
        token,
        payload: { name: 'Saved Despite Fan-out' },
      });
      // Without the savepoint the aborted transaction failed the PATCH at COMMIT.
      expect(response.statusCode, response.body).toBe(200);
    } finally {
      fanOutFault.enabled = false;
    }
    const [stored] = await getOperatorDatabase()
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, organization.id));
    expect(stored?.name).toBe('Saved Despite Fan-out');
    expect(await envelopes(webhook.id, 'organization.updated')).toEqual([]);
  });

  it('subscribing to membership or subscription events needs the matching read permission', async () => {
    const webhookOnly = await createSubscribedOrganization(
      ['organization.updated'],
      ['webhook:read', 'webhook:manage'],
    );
    for (const events of [['membership.created'], ['subscription.updated']]) {
      const refused = await injectAuthenticated(app, {
        method: 'PATCH',
        url: testApiPath(`/notify/webhooks/${webhookOnly.webhook.public_id}`),
        token: webhookOnly.token,
        payload: { events },
      });
      // Otherwise a webhook-only role would receive member emails it cannot read through the API.
      expect(refused.statusCode, refused.body).toBe(403);
    }
    const organizationEvents = await injectAuthenticated(app, {
      method: 'PATCH',
      url: testApiPath(`/notify/webhooks/${webhookOnly.webhook.public_id}`),
      token: webhookOnly.token,
      payload: { events: ['organization.created', 'organization.updated'] },
    });
    expect(organizationEvents.statusCode, organizationEvents.body).toBe(200);

    const reader = await createSubscribedOrganization(
      ['organization.updated'],
      ['webhook:read', 'webhook:manage', 'membership:read'],
    );
    const allowed = await injectAuthenticated(app, {
      method: 'PATCH',
      url: testApiPath(`/notify/webhooks/${reader.webhook.public_id}`),
      token: reader.token,
      payload: { events: ['membership.created'] },
    });
    expect(allowed.statusCode, allowed.body).toBe(200);
  });

  it('updating a webhook needs the read permissions behind the events it already receives', async () => {
    // The owner subscribed it to member events; a webhook-only manager must not repoint it.
    const subscribed = await createSubscribedOrganization(['membership.created']);
    const webhookOnlyRole = await createRoleWithPermissions({
      organizationId: subscribed.organization.id,
      permissionCodes: ['webhook:read', 'webhook:manage'],
      createdByUserId: subscribed.owner.id,
    });
    const manager = await createTestUser();
    await createMembership({
      userId: manager.id,
      organizationId: subscribed.organization.id,
      roleId: webhookOnlyRole.id,
    });
    const managerToken = await generateTestToken({
      userId: manager.public_id,
      organizationPublicId: subscribed.organization.public_id,
    });

    for (const payload of [{ url: 'https://example.com/elsewhere' }, { is_enabled: false }]) {
      const refused = await injectAuthenticated(app, {
        method: 'PATCH',
        url: testApiPath(`/notify/webhooks/${subscribed.webhook.public_id}`),
        token: managerToken,
        payload,
      });
      // Its pending membership attempts would go to the new URL at delivery time.
      expect(refused.statusCode, refused.body).toBe(403);
    }

    const organizationOnly = await createSubscribedOrganization(
      ['organization.updated'],
      ['webhook:read', 'webhook:manage'],
    );
    const allowed = await injectAuthenticated(app, {
      method: 'PATCH',
      url: testApiPath(`/notify/webhooks/${organizationOnly.webhook.public_id}`),
      token: organizationOnly.token,
      payload: { url: 'https://example.com/elsewhere' },
    });
    expect(allowed.statusCode, allowed.body).toBe(200);
  });

  it('a Stripe sync that changes no customer-visible field emits nothing', async () => {
    const { organization, webhook } = await createSubscribedOrganization();
    const plan = await createTestPlan();
    const providerSubscriptionId = `sub_unchanged_${randomUUID()}`;
    const subscription = await createTestSubscription({
      organizationId: organization.id,
      planId: plan.id,
      providerSubscriptionId,
    });
    const nowSeconds = Math.floor(Date.now() / 1000);
    const updatedEvent = (created: number, cancelAtPeriodEnd: boolean) =>
      ({
        id: `evt_sync_${randomUUID()}`,
        object: 'event',
        type: 'customer.subscription.updated',
        created,
        data: {
          object: {
            id: providerSubscriptionId,
            object: 'subscription',
            status: 'active',
            cancel_at_period_end: cancelAtPeriodEnd,
            canceled_at: null,
            items: {
              data: [{ current_period_start: nowSeconds, current_period_end: nowSeconds + 86_400 }],
            },
          },
        },
      }) as unknown as Stripe.Event;

    // The first sync rewrites the periods to Stripe's whole seconds: a real change.
    await app.billingDomain.stripeWebhookService.handleEvent(updatedEvent(nowSeconds + 1, false));
    expect(await envelopes(webhook.id, 'subscription.updated')).toHaveLength(1);
    // The same state again (a redelivery, or the reconciliation after an HTTP mutation): nothing new.
    await app.billingDomain.stripeWebhookService.handleEvent(updatedEvent(nowSeconds + 2, false));
    expect(await envelopes(webhook.id, 'subscription.updated')).toHaveLength(1);
    // A real change again.
    await app.billingDomain.stripeWebhookService.handleEvent(updatedEvent(nowSeconds + 3, true));
    const updates = await envelopes(webhook.id, 'subscription.updated');
    expect(updates).toHaveLength(2);
    expectEnvelope(updates[1], 'subscription.updated', subscription.public_id);
    expect(updates[1]?.data).toMatchObject({ cancel_at_period_end: true });
  });

  it('cancelling for organization offboarding emits no event (nothing could deliver it)', async () => {
    const { organization, webhook } = await createSubscribedOrganization();
    const plan = await createTestPlan();
    await createTestSubscription({ organizationId: organization.id, planId: plan.id });

    await app.billingDomain.subscriptionService.cancelActiveForOrganizationOffboarding(
      organization.public_id,
    );

    expect(await envelopes(webhook.id, 'subscription.cancelled')).toEqual([]);
  });
});
