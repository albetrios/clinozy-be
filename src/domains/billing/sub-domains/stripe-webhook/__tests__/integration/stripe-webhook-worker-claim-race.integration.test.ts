import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { createDomainContainers } from '@/worker-containers.js';
import { StripeWebhookRetryLaterError } from '@/domains/billing/sub-domains/stripe-webhook/stripe-webhook.types.js';
import { StripeWebhookEventRepository } from '@/domains/billing/sub-domains/stripe-webhook/stripe-webhook-event.repository.js';
import { stripe_webhook_events } from '@/domains/billing/sub-domains/stripe-webhook/stripe-webhook.schema.js';
import { SubscriptionRepository } from '@/domains/billing/sub-domains/subscription/subscription.repository.js';
import { subscriptions } from '@/domains/billing/sub-domains/subscription/subscription.schema.js';
import { createTestSubscription } from '@/domains/billing/__tests__/factories/subscription.factory.js';
import {
  MAINTENANCE_SCOPE,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestPlan } from '@/tests/factories/plan.factory.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';

describe('Stripe webhook execution claims against PostgreSQL', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ten concurrent handlers reclaim one ingress reservation and apply one persisted update', async () => {
    const user = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: user.id });
    const plan = await createTestPlan();
    const providerSubscriptionId = `sub_claim_race_${generatePublicId('subscription')}`;
    const subscription = await createTestSubscription({
      organizationId: organization.id,
      planId: plan.id,
      status: 'ACTIVE',
      providerSubscriptionId,
    });
    const nowSeconds = Math.floor(Date.now() / 1000);
    const event = {
      id: `evt_claim_race_${generatePublicId('subscription')}`,
      type: 'customer.subscription.updated',
      created: nowSeconds,
      data: {
        object: {
          id: providerSubscriptionId,
          status: 'past_due',
          metadata: { organization_id: organization.public_id },
          items: {
            data: [{ current_period_start: nowSeconds, current_period_end: nowSeconds + 86_400 }],
          },
        },
      },
    } as unknown as Stripe.Event;

    // Reserve exactly as HTTP ingress does, before any worker is allowed to execute.
    // attempt_count=0 is a durable reservation, not the execution claim.
    const ledgerRepository = new StripeWebhookEventRepository();
    const ingressClaim = await withMaintenanceDatabaseContext(
      MAINTENANCE_SCOPE.SYSTEM_TABLE_WORKER,
      () =>
        ledgerRepository.tryClaimEvent({
          stripe_event_id: event.id,
          event_type: event.type,
          stripe_created_at: new Date(event.created * 1000),
          request_id: 'req-claim-race',
        }),
    );
    expect(ingressClaim).toBe('claimed');

    // Observation only: spy delegates to the real SQL implementation; no claim outcomes are mocked.
    const updateSpy = vi.spyOn(
      SubscriptionRepository.prototype,
      'syncFromStripeProviderSubscription',
    );
    // Ten concurrent runs of the worker's own service (the composition root the worker builds).
    const { stripeWebhookService } = createDomainContainers().billingDomain;
    const outcomes = await Promise.allSettled(
      Array.from({ length: 10 }, () => stripeWebhookService.handleEvent(event)),
    );
    expect(outcomes.some((outcome) => outcome.status === 'fulfilled')).toBe(true);
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        expect(outcome.reason).toBeInstanceOf(StripeWebhookRetryLaterError);
        expect((outcome.reason as Error).message).toContain(
          `stripe.webhook.event_in_flight:${event.id}`,
        );
      }
    }
    expect(updateSpy).toHaveBeenCalledTimes(1);

    const ledger = await getOperatorDatabase()
      .select()
      .from(stripe_webhook_events)
      .where(eq(stripe_webhook_events.stripe_event_id, event.id));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ processing_status: 'processed', attempt_count: 1 });
    expect(ledger[0]?.processed_at).toBeInstanceOf(Date);
    const [persisted] = await getOperatorDatabase()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscription.id));
    expect(persisted?.status).toBe('PAST_DUE');
    expect(persisted?.last_stripe_event_created_at).toEqual(new Date(nowSeconds * 1000));

    await stripeWebhookService.handleEvent(event);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [replayedLedger] = await getOperatorDatabase()
      .select()
      .from(stripe_webhook_events)
      .where(eq(stripe_webhook_events.stripe_event_id, event.id));
    expect(replayedLedger?.attempt_count).toBe(1);
  });
});
