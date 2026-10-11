import type { OrganizationBillingContext } from '@/domains/tenancy/sub-domains/organization/organization.types.js';
import type { PlanRecord } from '@/domains/billing/sub-domains/plan/plan.service.js';

/**
 * Authoritative initial state and identifiers returned by {@link PaymentProvider.createSubscription}.
 * A configured provider supplies all fields; an unconfigured provider returns an empty no-op result.
 * Requiring the state with a provider subscription prevents the repository default from granting
 * entitlement to an unpaid subscription.
 */
export type PaymentProviderCreateResult =
  | {
      providerSubscriptionId: string;
      providerCustomerId: string;
      initialStatus: string;
    }
  | {
      providerSubscriptionId?: never;
      providerCustomerId?: never;
      initialStatus?: never;
    };

/**
 * Port for external payment provider subscription lifecycle (Stripe today; others later).
 */
export interface PaymentProvider {
  isConfigured(): boolean;

  getProviderPriceId(options: {
    plan: PlanRecord;
    billingCycle: 'monthly' | 'yearly';
  }): string | null;

  createSubscription(input: {
    organization: OrganizationBillingContext;
    plan: PlanRecord;
    billingCycle: 'monthly' | 'yearly';
    /** Seats billed from the first invoice (the organization's current members, at least 1). */
    quantity?: number;
    trialEnd?: string;
    idempotencyKey?: string;
  }): Promise<PaymentProviderCreateResult>;

  cancelSubscriptionAtPeriodEnd(options: {
    providerSubscriptionId: string;
    idempotencyKey?: string | undefined;
  }): Promise<void>;

  /**
   * Cancels the subscription immediately (reaudit-#6). Used for never-activated `INCOMPLETE`
   * subscriptions where `cancel_at_period_end` is a no-op — the organization needs the slot freed now.
   */
  cancelSubscriptionImmediately(options: {
    providerSubscriptionId: string;
    idempotencyKey?: string | undefined;
  }): Promise<void>;

  resumeSubscription(options: {
    providerSubscriptionId: string;
    idempotencyKey?: string | undefined;
  }): Promise<void>;

  updateSubscriptionPrice(options: {
    providerSubscriptionId: string;
    providerPriceId: string;
    idempotencyKey?: string | undefined;
  }): Promise<void>;

  /**
   * Sets the purchased seat quantity on the subscription (REQ-4). Synced out-of-band from the
   * organization's member count by the seat-quantity-sync worker; idempotent via `idempotencyKey`.
   */
  updateSubscriptionQuantity(options: {
    providerSubscriptionId: string;
    quantity: number;
    idempotencyKey?: string | undefined;
  }): Promise<void>;

  compensateFailedCreate(providerSubscriptionId: string): Promise<void>;

  compensatePlanChange(options: {
    providerSubscriptionId: string;
    previousProviderPriceId: string;
  }): Promise<void>;
}
