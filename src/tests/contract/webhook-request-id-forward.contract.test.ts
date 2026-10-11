/**
 * Outbound webhook delivery must forward the API request id for log correlation.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { eventBus, runWithOnCommitScope } from '@/core/events/event-bus.js';
import { NOTIFY_EVENT } from '@/domains/notify/sub-domains/webhook/events/notify.events.js';
import { registerWebhookDeliveryEventHandlers } from '@/domains/notify/sub-domains/webhook/webhook-delivery/events/webhook-delivery.event-handlers.js';
import { processWebhookDeliveryAttempt } from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery.worker.js';

// The service paths under test run inside the real principal wrapper, which
// opens a `database.transaction()` — passthrough so no Postgres is needed
// (CI's unit/contract lanes run without a database service).
vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Blanket maintenance passthrough: services this suite touches (directly or via
    // cross-domain imports) may enter maintenance contexts (tombstoning, admin reads) —
    // the real wrapper opens a database.transaction() and CI's unit lane has no Postgres.
    withMaintenanceDatabaseContext: vi.fn(
      async ({ scope: _scope, callback }: { scope: unknown; callback: () => Promise<unknown> }) =>
        callback(),
    ),
    withAppDatabaseContext: vi.fn(
      async ({ scope: _scope, callback }: { scope: unknown; callback: () => Promise<unknown> }) =>
        callback(),
    ),
  };
});

const DELIVERY_ATTEMPT_PUBLIC_ID = 'wda_9z3rura5kqvcv8zggriym';

const enqueueWebhookDeliveryMock = vi.fn();
const findOrganizationPublicIdByDeliveryAttemptPublicIdMock = vi.fn();

vi.mock(
  '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    enqueueWebhookDelivery: (...arguments_: unknown[]) => enqueueWebhookDeliveryMock(...arguments_),
  }),
);

vi.mock(
  '@/domains/notify/sub-domains/webhook/webhook-delivery/webhook-delivery.repository.js',
  () => ({
    // sec-N1: worker re-checks `webhookIsEnabled` / `webhookDeletedAt` at claim
    // time; the contract fixture must mark the webhook explicitly enabled so the
    // delivery proceeds through the claim → deliver → header-forward path.
    createWorkerWebhookDeliveryQueries: () => ({
      findWebhookDeliveryAttemptWithWebhook: vi.fn().mockResolvedValue({
        deliveryAttemptId: 7,
        deliveryAttemptPublicId: DELIVERY_ATTEMPT_PUBLIC_ID,
        webhookId: 1,
        webhookPublicId: 'wh_0y8vf3ktxqnhcm1ze21ab',
        webhookUrl: 'https://example.com/hook',
        encryptedSecret: 'v1:secret',
        eventType: 'webhook.test',
        payload: { ok: true },
        attemptCount: 0,
        webhookIsEnabled: true,
        webhookDeletedAt: null,
        encryptedSecretPrevious: null,
        secretRotatedAt: null,
      }),
    }),
    findOrganizationPublicIdByDeliveryAttemptPublicId: (...arguments_: unknown[]) =>
      findOrganizationPublicIdByDeliveryAttemptPublicIdMock(...arguments_),
    markDeliveryAttemptEnqueueFailed: vi.fn(),
  }),
);

vi.mock('@/shared/utils/security/field-secret-encryption.util.js', () => ({
  decryptFieldSecret: vi.fn(() => 'signing-secret'),
}));

vi.mock('@/shared/utils/security/webhook-url.util.js', () => ({
  validateWebhookUrl: vi.fn().mockResolvedValue(undefined),
}));

const deliveryAttemptRepository = {
  tryMarkSending: vi.fn().mockResolvedValue('claimed'),
  recordOutcome: vi.fn().mockResolvedValue(undefined),
};

describe('Webhook request id forward contract', () => {
  const fetchMock = vi.fn().mockResolvedValue({
    status: 200,
    ok: true,
    text: vi.fn().mockResolvedValue('ok'),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    findOrganizationPublicIdByDeliveryAttemptPublicIdMock.mockResolvedValue('org_public_contract');
    registerWebhookDeliveryEventHandlers();
  });

  it('propagates requestId from domain event through the queue into outbound X-Request-Id', async () => {
    const correlationRequestId = 'req-api-to-subscriber';

    await runWithOnCommitScope(async () => {
      await eventBus.emit({
        type: NOTIFY_EVENT.WEBHOOK_DELIVERY_REQUESTED,
        payload: { delivery_attempt_public_id: DELIVERY_ATTEMPT_PUBLIC_ID },
        timestamp: new Date(),
        requestId: correlationRequestId,
      });
      await eventBus.flushOnCommit();
    });

    expect(enqueueWebhookDeliveryMock).toHaveBeenCalledWith({
      deliveryAttemptPublicId: DELIVERY_ATTEMPT_PUBLIC_ID,
      organizationPublicId: 'org_public_contract',
      requestId: correlationRequestId,
    });

    await processWebhookDeliveryAttempt({
      deliveryAttemptPublicId: DELIVERY_ATTEMPT_PUBLIC_ID,
      organizationPublicId: 'org_public_contract',
      jobContext: { id: 'job-contract', attemptsMade: 0, requestId: correlationRequestId },
      fetchImplementation: fetchMock,
      deliveryAttemptRepository: deliveryAttemptRepository as never,
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestInit.headers).toMatchObject({
      'X-Request-Id': correlationRequestId,
      'X-Webhook-Delivery-Id': DELIVERY_ATTEMPT_PUBLIC_ID,
    });
  });
});
