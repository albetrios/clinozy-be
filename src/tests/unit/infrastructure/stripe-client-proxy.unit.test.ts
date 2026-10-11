import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { globalAgent } from 'node:https';

const { stripeConstructor, fetchClient } = vi.hoisted(() => ({
  stripeConstructor: vi.fn(function StripeFixture(
    _key: string,
    _options: Record<string, unknown>,
  ) {}),
  fetchClient: vi.fn(() => ({ fetchTransport: true })),
}));
vi.mock('stripe', () => ({
  default: Object.assign(stripeConstructor, { createFetchHttpClient: fetchClient }),
}));
vi.mock('@/shared/config/env.config.js', () => ({
  env: { STRIPE_SECRET_KEY: 'sk_test_fixture_only', STRIPE_HTTP_TIMEOUT_MS: 5000 },
}));
vi.mock('@/infrastructure/outbound/index.js', () => ({
  buildOutboundCallOptions: vi.fn(),
  outboundCall: vi.fn(),
}));

/** Production transport must reuse the platform's proxy-aware HTTPS agent, while preserving contract transport. */
describe('Stripe transport proxy configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('CONTRACT_TESTS_ENABLED', 'false');
  });
  afterEach(() => vi.unstubAllEnvs());
  it('uses the platform HTTPS agent and retains the singleton', async () => {
    const { getStripeClient } = await import('@/infrastructure/payment/stripe.client.js');
    const client = getStripeClient();
    expect(getStripeClient()).toBe(client);
    expect(stripeConstructor).toHaveBeenCalledOnce();
    expect(stripeConstructor).toHaveBeenCalledWith(
      'sk_test_fixture_only',
      expect.objectContaining({ httpAgent: globalAgent, timeout: 5000 }),
    );
    expect(stripeConstructor.mock.calls[0]?.[1]).not.toHaveProperty('httpClient');
  });
  it('preserves the explicit contract-test fetch transport', async () => {
    vi.stubEnv('CONTRACT_TESTS_ENABLED', 'true');
    const { getStripeClient } = await import('@/infrastructure/payment/stripe.client.js');
    getStripeClient();
    expect(fetchClient).toHaveBeenCalledOnce();
    expect(stripeConstructor).toHaveBeenCalledWith(
      'sk_test_fixture_only',
      expect.objectContaining({ httpClient: { fetchTransport: true } }),
    );
  });
});
