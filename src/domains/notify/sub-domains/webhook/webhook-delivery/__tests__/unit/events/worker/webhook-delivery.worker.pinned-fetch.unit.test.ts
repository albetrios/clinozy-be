import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  processWebhookDeliveryAttempt,
  type WebhookDeliveryFetch,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery.worker.js';
import { resetWebhookOutboundCircuitsForTesting } from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-outbound-circuit.js';
import { createPinnedWebhookFetch } from '@/shared/utils/security/webhook-outbound-fetch.util.js';

/**
 * C-4: the delivery worker always sends through the DNS-pinned fetch unless a test injects its
 * own `fetchImplementation`. It used to compare the default against the `globalThis.fetch`
 * captured at import, so a global replaced afterwards (instrumentation, a library) silently
 * skipped DNS pinning and the allowlist.
 */

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    withMaintenanceDatabaseContext: vi.fn(
      async ({ callback }: { scope: unknown; callback: () => Promise<unknown> }) => callback(),
    ),
    withAppDatabaseContext: vi.fn(
      async ({ callback }: { scope: unknown; callback: () => Promise<unknown> }) => callback(),
    ),
  };
});

const { deliveryContextFixture } = vi.hoisted(() => ({
  deliveryContextFixture: {
    deliveryAttemptId: 42,
    deliveryAttemptPublicId: 'wda_0y8vf3ktxqnhcm1ze21ab',
    webhookId: 1,
    webhookPublicId: 'wh_0y8vf3ktxqnhcm1ze21ab',
    webhookUrl: 'https://example.com/hook',
    encryptedSecret: 'v1:secret',
    eventType: 'webhook.test',
    payload: { ok: true },
    attemptCount: 0,
    webhookIsEnabled: true,
    webhookDeletedAt: null as Date | null,
    encryptedSecretPrevious: null as string | null,
    secretRotatedAt: null as Date | null,
  },
}));

vi.mock(
  '@/domains/notify/sub-domains/webhook/webhook-delivery/webhook-delivery.repository.js',
  () => ({
    createWorkerWebhookDeliveryQueries: vi.fn(() => ({
      findWebhookDeliveryAttemptWithWebhook: vi.fn(async () => ({ ...deliveryContextFixture })),
      disableWebhookAfterEndpointGone: vi.fn(),
    })),
  }),
);

vi.mock('@/shared/utils/security/field-secret-encryption.util.js', () => ({
  decryptFieldSecret: vi.fn(() => 'signing-secret'),
}));

vi.mock('@/shared/utils/security/webhook-url.util.js', () => ({
  validateWebhookUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/utils/security/webhook-outbound-fetch.util.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, createPinnedWebhookFetch: vi.fn() };
});

function respondOk(): Mock<WebhookDeliveryFetch> {
  return vi.fn(async () => new Response('ok', { status: 200 })) as Mock<WebhookDeliveryFetch>;
}

describe('processWebhookDeliveryAttempt always pins its outbound call, C-4', () => {
  const repository = {
    tryMarkSending: vi.fn().mockResolvedValue('claimed'),
    recordOutcome: vi.fn().mockResolvedValue(undefined),
  };
  let pinnedFetch: Mock<WebhookDeliveryFetch>;

  beforeEach(() => {
    pinnedFetch = respondOk();
    vi.mocked(createPinnedWebhookFetch).mockReset().mockResolvedValue(pinnedFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetWebhookOutboundCircuitsForTesting();
  });

  it('delivers through the pinned fetch even after globalThis.fetch is replaced', async () => {
    const replacedGlobalFetch = respondOk();
    vi.stubGlobal('fetch', replacedGlobalFetch);

    const result = await processWebhookDeliveryAttempt({
      deliveryAttemptPublicId: deliveryContextFixture.deliveryAttemptPublicId,
      organizationPublicId: 'org_public_1',
      jobContext: { id: 'job-1', attemptsMade: 0 },
      deliveryAttemptRepository: repository as never,
    });

    expect(result).toEqual({ outcome: 'delivered', httpStatus: 200 });
    expect(createPinnedWebhookFetch).toHaveBeenCalledExactlyOnceWith('https://example.com/hook');
    expect(pinnedFetch).toHaveBeenCalledOnce();
    expect(replacedGlobalFetch).not.toHaveBeenCalled();
  });

  it('uses an explicitly injected fetch and skips pinning (the test seam)', async () => {
    const injectedFetch = respondOk();

    await processWebhookDeliveryAttempt({
      deliveryAttemptPublicId: deliveryContextFixture.deliveryAttemptPublicId,
      organizationPublicId: 'org_public_1',
      jobContext: { id: 'job-1', attemptsMade: 0 },
      fetchImplementation: injectedFetch,
      deliveryAttemptRepository: repository as never,
    });

    expect(injectedFetch).toHaveBeenCalledOnce();
    expect(createPinnedWebhookFetch).not.toHaveBeenCalled();
  });
});
