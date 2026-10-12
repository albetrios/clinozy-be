import { randomUUID } from 'node:crypto';
import type {
  PaymentProvider,
  PaymentProviderCreateResult,
} from '@/domains/billing/sub-domains/subscription/payment-provider.port.js';
import type { PlanRecord } from '@/domains/billing/sub-domains/plan/plan.service.js';

/** One call the subscription service made to the payment provider, as the test reads it back. */
export type PaymentProviderCall =
  | {
      method: 'createSubscription';
      providerPriceId: string | null;
      billingCycle: 'monthly' | 'yearly';
      quantity: number | undefined;
    }
  | { method: 'updateSubscriptionPrice'; providerSubscriptionId: string; providerPriceId: string }
  | { method: 'updateSubscriptionQuantity'; providerSubscriptionId: string; quantity: number }
  | {
      method:
        | 'cancelSubscriptionAtPeriodEnd'
        | 'cancelSubscriptionImmediately'
        | 'resumeSubscription'
        | 'compensateFailedCreate';
      providerSubscriptionId: string;
    }
  | {
      method: 'compensatePlanChange';
      providerSubscriptionId: string;
      previousProviderPriceId: string;
    };

/** Every call made to any {@link FakePaymentProvider} since the last {@link resetPaymentProviderCalls}. */
export const paymentProviderCalls: PaymentProviderCall[] = [];

/** Clears {@link paymentProviderCalls}; call it in `beforeEach`. */
export function resetPaymentProviderCalls(): void {
  paymentProviderCalls.length = 0;
}

/**
 * A configured payment provider that keeps Stripe's rules without the network: a plan is billed
 * only through its own provider price for the cycle, a new subscription starts `ACTIVE` (Stripe's
 * answer for a paid-up or zero-price subscription), and every call is recorded in
 * {@link paymentProviderCalls}.
 *
 * @remarks
 * Typed against {@link PaymentProvider}, so a method added to the port fails to compile here
 * instead of leaving an integration suite on a fake that silently lacks it. Swap it in with
 * `vi.mock('@/domains/billing/sub-domains/subscription/stripe-payment-provider.js', async () => ({
 * StripePaymentProvider: (await import('…/fake-payment-provider.js')).FakePaymentProvider }))`.
 */
export class FakePaymentProvider implements PaymentProvider {
  isConfigured(): boolean {
    return true;
  }

  getProviderPriceId({
    plan,
    billingCycle,
  }: {
    plan: PlanRecord;
    billingCycle: 'monthly' | 'yearly';
  }): string | null {
    return (
      (billingCycle === 'yearly' ? plan.stripe_price_yearly_id : plan.stripe_price_monthly_id) ??
      null
    );
  }

  async createSubscription(input: {
    plan: PlanRecord;
    billingCycle: 'monthly' | 'yearly';
    quantity?: number;
  }): Promise<PaymentProviderCreateResult> {
    paymentProviderCalls.push({
      method: 'createSubscription',
      providerPriceId: this.getProviderPriceId({
        plan: input.plan,
        billingCycle: input.billingCycle,
      }),
      billingCycle: input.billingCycle,
      quantity: input.quantity,
    });
    return {
      providerSubscriptionId: `sub_fake_${randomUUID()}`,
      providerCustomerId: `cus_fake_${randomUUID()}`,
      initialStatus: 'ACTIVE',
    };
  }

  async cancelSubscriptionAtPeriodEnd({
    providerSubscriptionId,
  }: {
    providerSubscriptionId: string;
  }): Promise<void> {
    paymentProviderCalls.push({ method: 'cancelSubscriptionAtPeriodEnd', providerSubscriptionId });
  }

  async cancelSubscriptionImmediately({
    providerSubscriptionId,
  }: {
    providerSubscriptionId: string;
  }): Promise<void> {
    paymentProviderCalls.push({ method: 'cancelSubscriptionImmediately', providerSubscriptionId });
  }

  async resumeSubscription({
    providerSubscriptionId,
  }: {
    providerSubscriptionId: string;
  }): Promise<void> {
    paymentProviderCalls.push({ method: 'resumeSubscription', providerSubscriptionId });
  }

  async updateSubscriptionPrice({
    providerSubscriptionId,
    providerPriceId,
  }: {
    providerSubscriptionId: string;
    providerPriceId: string;
  }): Promise<void> {
    paymentProviderCalls.push({
      method: 'updateSubscriptionPrice',
      providerSubscriptionId,
      providerPriceId,
    });
  }

  async updateSubscriptionQuantity({
    providerSubscriptionId,
    quantity,
  }: {
    providerSubscriptionId: string;
    quantity: number;
  }): Promise<void> {
    paymentProviderCalls.push({
      method: 'updateSubscriptionQuantity',
      providerSubscriptionId,
      quantity,
    });
  }

  async compensateFailedCreate(providerSubscriptionId: string): Promise<void> {
    paymentProviderCalls.push({ method: 'compensateFailedCreate', providerSubscriptionId });
  }

  async compensatePlanChange({
    providerSubscriptionId,
    previousProviderPriceId,
  }: {
    providerSubscriptionId: string;
    previousProviderPriceId: string;
  }): Promise<void> {
    paymentProviderCalls.push({
      method: 'compensatePlanChange',
      providerSubscriptionId,
      previousProviderPriceId,
    });
  }
}
