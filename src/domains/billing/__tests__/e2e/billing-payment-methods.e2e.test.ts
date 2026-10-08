import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestPlan } from '@/tests/factories/plan.factory.js';
import { createTestSubscription } from '@/domains/billing/__tests__/factories/subscription.factory.js';
import {
  createMembership,
  createRoleWithPermissions,
  seedPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';

/**
 * E2E coverage for the billing payment-method / invoice read routes and the SetupIntent write.
 * Stripe is stubbed (only the client functions these routes touch) so the happy-path statuses
 * (200/200/200/200) are exercised deterministically without a live Stripe call.
 */
vi.mock('@/infrastructure/payment/stripe.client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/payment/stripe.client.js')>();
  return {
    ...actual,
    isStripeConfigured: () => true,
    listStripeInvoices: vi.fn(async () => ({
      data: [
        {
          id: 'in_billing_e2e',
          number: 'INV-001',
          status: 'paid',
          amount_due: 1999,
          amount_paid: 1999,
          currency: 'usd',
          created: 1_700_000_000,
          due_date: null,
          hosted_invoice_url: null,
          invoice_pdf: null,
          customer: 'cus_test_billing_e2e',
          customer_email: 'private@example.test',
        },
      ],
      has_more: false,
    })),
    listStripePaymentMethods: vi.fn(async () => [
      {
        id: 'pm_billing_e2e',
        customer: 'cus_test_billing_e2e',
        billing_details: { email: 'private@example.test' },
        card: {
          brand: 'visa',
          last4: '4242',
          exp_month: 12,
          exp_year: 2030,
          fingerprint: 'private',
        },
      },
    ]),
    retrieveStripeCustomerDefaultPaymentMethodId: vi.fn(async () => 'pm_billing_e2e'),
    createStripeSetupIntent: vi.fn(async () => 'seti_test_client_secret_0123456789'),
    retrieveStripeSubscriptionPaymentClientSecret: vi.fn(async () => 'pi_test_client_secret'),
  };
});

const BILLING_PERMISSIONS = ['subscription:read', 'subscription:manage'] as const;

describe('Billing payment methods (e2e)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { app: testApplication } = await createTestApp();
    app = testApplication;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    await seedPermissions([...BILLING_PERMISSIONS]);
  });

  /** Team organization + membership with billing perms, plus an ACTIVE Stripe-backed subscription. */
  async function createBillingContext(status: 'ACTIVE' | 'INCOMPLETE' = 'ACTIVE') {
    const user = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: user.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [...BILLING_PERMISSIONS],
    });
    await createMembership({ userId: user.id, organizationId: organization.id, roleId: role.id });
    const plan = await createTestPlan();
    const subscription = await createTestSubscription({
      organizationId: organization.id,
      planId: plan.id,
      status,
      providerSubscriptionId: `sub_billing_e2e_${randomUUID()}`,
      providerCustomerId: 'cus_test_billing_e2e',
      createdByUserId: user.id,
    });
    const token = await generateTestToken({
      userId: user.public_id,
      organizationPublicId: organization.public_id,
    });
    return { token, subscription };
  }

  it('GET /billing/invoices returns 200 with a paginated envelope', async () => {
    const { token } = await createBillingContext();
    const response = await injectAuthenticated(app, {
      url: testApiPath('/billing/invoices'),
      token,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: unknown[];
      meta: { pagination: { has_more: boolean; next: string | null } };
    };
    expect(body.data).toEqual([
      {
        id: 'in_billing_e2e',
        invoice_number: 'INV-001',
        status: 'paid',
        amount_due: '19.99',
        amount_paid: '19.99',
        currency: 'usd',
        created_at: new Date(1_700_000_000_000).toISOString(),
        due_date: null,
        hosted_invoice_url: null,
        invoice_pdf: null,
      },
    ]);
    expect(body.meta.pagination).toMatchObject({ has_more: false, next: null });
  });

  it('GET /billing/payment-methods projects the default card without provider PII', async () => {
    const { token } = await createBillingContext();
    const response = await injectAuthenticated(app, {
      url: testApiPath('/billing/payment-methods'),
      token,
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { data: unknown[] }).data).toEqual([
      {
        id: 'pm_billing_e2e',
        brand: 'visa',
        last4: '4242',
        exp_month: 12,
        exp_year: 2030,
        is_default: true,
      },
    ]);
  });

  it('GET /billing/subscriptions/:subscription_id/payment-setup returns null for an ACTIVE subscription', async () => {
    const { token, subscription } = await createBillingContext();
    const response = await injectAuthenticated(app, {
      url: testApiPath(`/billing/subscriptions/${subscription.public_id}/payment-setup`),
      token,
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { data: unknown }).data).toEqual({ client_secret: null });
  });

  it('GET /billing/subscriptions/:subscription_id/payment-setup returns the INCOMPLETE payment secret', async () => {
    const { token, subscription } = await createBillingContext('INCOMPLETE');
    const response = await injectAuthenticated(app, {
      url: testApiPath(`/billing/subscriptions/${subscription.public_id}/payment-setup`),
      token,
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { data: unknown }).data).toEqual({
      client_secret: 'pi_test_client_secret',
    });
  });

  it('POST /billing/payment-methods/setup returns the SetupIntent secret', async () => {
    const { token } = await createBillingContext();
    const response = await injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/billing/payment-methods/setup'),
      token,
      payload: {},
      headers: { 'x-idempotency-key': `e2e-payment-method-setup-${randomUUID()}` },
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { data: unknown }).data).toEqual({
      client_secret: 'seti_test_client_secret_0123456789',
    });
  });
});
