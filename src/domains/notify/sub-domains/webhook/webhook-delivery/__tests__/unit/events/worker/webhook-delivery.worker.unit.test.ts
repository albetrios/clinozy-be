import { DelayedError, UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from 'vitest';
import * as fieldSecretEncryption from '@/shared/utils/security/field-secret-encryption.util.js';
import {
  acquireWebhookDeliveryHostSlot,
  resetWebhookDeliveryHostSlots,
  WebhookDeliveryHostAtCapacity,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery-host-gate.js';
import {
  deferWebhookDeliveryWhenHostAtCapacity,
  processWebhookDeliveryAttempt,
  WebhookEndpointFailure,
  type WebhookDeliveryFetch,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery.worker.js';
import { resetWebhookOutboundCircuitsForTesting } from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-outbound-circuit.js';
import {
  WEBHOOK_DELIVERY_JOB_ATTEMPTS,
  WEBHOOK_DELIVERY_RETRY_DELAYS_MS,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js';

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Blanket maintenance passthrough: services this suite touches (directly or via
    // cross-domain imports) may enter maintenance contexts (tombstoning, admin reads) —
    // the real wrapper opens a database.transaction() and CI's unit lane has no Postgres.
    withMaintenanceDatabaseContext: vi.fn(
      async (_scope: unknown, callback: () => Promise<unknown>) => callback(),
    ),
    withAppDatabaseContext: vi.fn(async (_scope: unknown, callback: () => Promise<unknown>) =>
      callback(),
    ),
  };
});

const DELIVERY_ATTEMPT_PUBLIC_ID = 'wda_0y8vf3ktxqnhcm1ze21ab';

const { deliveryContextFixture, findDeliveryContextMock, disableWebhookMock } = vi.hoisted(() => {
  const fixture = {
    deliveryAttemptId: 42,
    // sec-new-B2: opaque public id used as the X-Webhook-Delivery-Id header value.
    deliveryAttemptPublicId: 'wda_0y8vf3ktxqnhcm1ze21ab',
    webhookId: 1,
    webhookPublicId: 'wh_0y8vf3ktxqnhcm1ze21ab',
    webhookUrl: 'https://example.com/hook',
    encryptedSecret: 'v1:secret',
    eventType: 'webhook.test',
    payload: { ok: true },
    attemptCount: 0,
    // sec-N1: worker re-checks the parent webhook's live state at claim time.
    webhookIsEnabled: true,
    webhookDeletedAt: null as Date | null,
    // sec-N8: dual-sign fields; null means no rotation overlap → single signature only.
    encryptedSecretPrevious: null as string | null,
    secretRotatedAt: null as Date | null,
  };
  return {
    deliveryContextFixture: fixture,
    findDeliveryContextMock: vi.fn(),
    disableWebhookMock: vi.fn(),
  };
});

vi.mock(
  '@/domains/notify/sub-domains/webhook/webhook-delivery/webhook-delivery.repository.js',
  () => ({
    createWorkerWebhookDeliveryQueries: vi.fn(() => ({
      findWebhookDeliveryAttemptWithWebhook: findDeliveryContextMock,
      disableWebhookAfterEndpointGone: disableWebhookMock,
    })),
  }),
);

vi.mock('@/shared/utils/security/field-secret-encryption.util.js', () => ({
  decryptFieldSecret: vi.fn(() => 'signing-secret'),
}));

vi.mock('@/shared/utils/security/webhook-url.util.js', () => ({
  validateWebhookUrl: vi.fn().mockResolvedValue(undefined),
}));

function createDeliveryAttemptRepositoryMock() {
  return {
    tryMarkSending: vi.fn().mockResolvedValue('claimed'),
    recordOutcome: vi.fn().mockResolvedValue(undefined),
  };
}

function respond(status: number, body = 'ok') {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    text: vi.fn().mockResolvedValue(body),
  }) as Mock<WebhookDeliveryFetch>;
}

describe('processWebhookDeliveryAttempt', () => {
  let fetchMock: Mock<WebhookDeliveryFetch>;
  let repository: ReturnType<typeof createDeliveryAttemptRepositoryMock>;

  const deliver = (attemptsMade = 0, requestId?: string) =>
    processWebhookDeliveryAttempt({
      deliveryAttemptPublicId: DELIVERY_ATTEMPT_PUBLIC_ID,
      organizationPublicId: 'org_public_1',
      jobContext: { id: 'job-1', attemptsMade, ...(requestId ? { requestId } : {}) },
      fetchImplementation: fetchMock,
      deliveryAttemptRepository: repository as never,
    });

  beforeEach(() => {
    resetWebhookDeliveryHostSlots();
    fetchMock = respond(200);
    repository = createDeliveryAttemptRepositoryMock();
    findDeliveryContextMock.mockReset().mockResolvedValue({ ...deliveryContextFixture });
    disableWebhookMock.mockReset().mockResolvedValue(undefined);
    vi.mocked(fieldSecretEncryption.decryptFieldSecret).mockReset();
    vi.mocked(fieldSecretEncryption.decryptFieldSecret).mockReturnValue('signing-secret');
  });

  afterEach(() => {
    resetWebhookOutboundCircuitsForTesting();
  });

  it('loads the attempt by its public id within the job organization', async () => {
    await deliver();

    expect(findDeliveryContextMock).toHaveBeenCalledExactlyOnceWith(
      DELIVERY_ATTEMPT_PUBLIC_ID,
      'org_public_1',
    );
  });

  it('forwards X-Request-Id and the delivery public id on outbound webhook delivery', async () => {
    await deliver(0, 'req-outbound-webhook');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestInit.headers).toMatchObject({
      'X-Request-Id': 'req-outbound-webhook',
      'X-Webhook-Delivery-Id': DELIVERY_ATTEMPT_PUBLIC_ID,
    });
  });

  it('claims, sends and records SENT on a 2xx response', async () => {
    const result = await deliver();

    expect(result).toEqual({ outcome: 'delivered', httpStatus: 200 });
    expect(repository.tryMarkSending).toHaveBeenCalledExactlyOnceWith(42);
    expect(repository.recordOutcome).toHaveBeenCalledExactlyOnceWith(42, {
      status: 'SENT',
      http_status_code: 200,
      response_body: 'ok',
    });
    expect(repository.tryMarkSending.mock.invocationCallOrder[0]!).toBeLessThan(
      repository.recordOutcome.mock.invocationCallOrder[0]!,
    );
  });

  // audit-#6: a hostile/broken endpoint returning an unbounded (or gzip-expanded) body must not
  // be buffered in full. The worker streams at most the byte read-cap then cancels the reader, so
  // a single delivery can never exhaust worker heap and poison-loop across retries.
  it('caps an oversized response body and cancels the reader instead of buffering it all', async () => {
    let cancelled = false;
    let chunksPulled = 0;
    const oversizedStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksPulled += 1;
        // 8 KiB per chunk; the stream never closes, so without a cap the read would run forever.
        controller.enqueue(new TextEncoder().encode('A'.repeat(8_192)));
      },
      cancel() {
        cancelled = true;
      },
    });
    fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      body: oversizedStream,
    }) as unknown as Mock<WebhookDeliveryFetch>;

    const result = await deliver();

    expect(result).toEqual({ outcome: 'delivered', httpStatus: 200 });
    expect(cancelled).toBe(true);
    expect(chunksPulled).toBeLessThan(10);
    const [, outcome] = repository.recordOutcome.mock.calls[0] as [
      number,
      { response_body: string },
    ];
    expect(outcome.response_body.length).toBeLessThanOrEqual(2_000);
    expect(outcome.response_body.endsWith('…[truncated]')).toBe(true);
  });

  it('records FAILED with the next scheduled retry and throws a receiver failure on non-2xx', async () => {
    fetchMock = respond(500, 'server error');
    const before = Date.now();

    const error = await deliver(1).catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(WebhookEndpointFailure);
    expect(error).toMatchObject({ expectedFinalFailure: true, message: /HTTP 500/ });
    expect(repository.recordOutcome).toHaveBeenCalledExactlyOnceWith(42, {
      status: 'FAILED',
      http_status_code: 500,
      response_body: 'server error',
      next_retry_at: expect.any(Date),
    });
    // attemptsMade 1 → the second failure → the second delay of the schedule.
    const [, outcome] = repository.recordOutcome.mock.calls[0] as [number, { next_retry_at: Date }];
    const delayMs = outcome.next_retry_at.getTime() - before;
    expect(delayMs).toBeGreaterThanOrEqual(WEBHOOK_DELIVERY_RETRY_DELAYS_MS[1] - 1_000);
    expect(delayMs).toBeLessThanOrEqual(WEBHOOK_DELIVERY_RETRY_DELAYS_MS[1] + 1_000);
  });

  it('schedules no retry on the final attempt and keeps the failure a receiver failure', async () => {
    fetchMock = vi
      .fn()
      .mockRejectedValue(new Error('network unavailable')) as Mock<WebhookDeliveryFetch>;

    const error = await deliver(WEBHOOK_DELIVERY_JOB_ATTEMPTS - 1).catch(
      (rejection: unknown) => rejection,
    );

    expect(error).toBeInstanceOf(WebhookEndpointFailure);
    expect((error as Error).message).toMatch(/network unavailable/);
    expect(repository.recordOutcome).toHaveBeenCalledExactlyOnceWith(42, {
      status: 'FAILED',
      response_body: expect.stringMatching(/network unavailable/),
      next_retry_at: null,
    });
  });

  it('410 Gone: records FAILED with no retry, turns the webhook off and completes', async () => {
    fetchMock = respond(410, 'gone');

    const result = await deliver();

    expect(result).toEqual({ outcome: 'endpoint_gone', httpStatus: 410 });
    expect(repository.recordOutcome).toHaveBeenCalledExactlyOnceWith(42, {
      status: 'FAILED',
      http_status_code: 410,
      response_body: 'gone',
      next_retry_at: null,
    });
    expect(disableWebhookMock).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('skips an attempt that was already sent', async () => {
    repository.tryMarkSending.mockResolvedValueOnce('already_sent');

    const result = await deliver();

    expect(result).toEqual({ outcome: 'skipped', reason: 'already_sent' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(repository.recordOutcome).not.toHaveBeenCalled();
  });

  it('sec-N1: records FAILED and skips when the webhook was disabled after the event', async () => {
    findDeliveryContextMock.mockResolvedValueOnce({
      ...deliveryContextFixture,
      webhookIsEnabled: false,
    });

    const result = await deliver();

    expect(result).toEqual({ outcome: 'skipped', reason: 'webhook_disabled' });
    expect(repository.tryMarkSending).not.toHaveBeenCalled();
    expect(repository.recordOutcome).toHaveBeenCalledExactlyOnceWith(42, {
      status: 'FAILED',
      response_body: 'webhook_disabled',
      next_retry_at: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails terminally when the attempt row does not exist in the job organization', async () => {
    findDeliveryContextMock.mockResolvedValueOnce(null);

    const error = await deliver().catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(UnrecoverableError);
    expect((error as Error).message).toContain(DELIVERY_ATTEMPT_PUBLIC_ID);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails terminally — recorded, no retry, no request — when the signing secret cannot be decrypted', async () => {
    vi.mocked(fieldSecretEncryption.decryptFieldSecret).mockImplementationOnce(() => {
      throw new Error('bad ciphertext');
    });

    const error = await deliver().catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(repository.recordOutcome).toHaveBeenCalledExactlyOnceWith(42, {
      status: 'FAILED',
      response_body: 'signing_secret_unreadable',
      next_retry_at: null,
    });
  });

  // P0-#1 regression: empty signing secret must NEVER produce an outbound delivery.
  // Previously the worker silently dropped the X-Webhook-Signature header and shipped
  // the payload, leaving the receiver unable to distinguish "secret rotated to empty"
  // from "attacker stripped the header" — a forgery primitive against any receiver
  // still trusting the request.
  it('P0-#1: fails terminally on an empty signing secret before any network call', async () => {
    vi.mocked(fieldSecretEncryption.decryptFieldSecret).mockReturnValueOnce('');

    const error = await deliver(2).catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(repository.recordOutcome).toHaveBeenCalledExactlyOnceWith(42, {
      status: 'FAILED',
      response_body: 'empty_signing_secret',
      next_retry_at: null,
    });
  });

  it('does not claim or record a failure when the destination host is at the in-flight cap', async () => {
    acquireWebhookDeliveryHostSlot('example.com');
    acquireWebhookDeliveryHostSlot('example.com');

    await expect(deliver()).rejects.toBeInstanceOf(WebhookDeliveryHostAtCapacity);

    expect(repository.tryMarkSending).not.toHaveBeenCalled();
    expect(repository.recordOutcome).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parks a host-at-capacity delivery without spending an attempt', async () => {
    const moveToDelayed = vi.fn().mockResolvedValue(undefined);
    const error = new WebhookDeliveryHostAtCapacity('example.com');

    await expect(
      deferWebhookDeliveryWhenHostAtCapacity({
        error,
        job: { moveToDelayed },
        token: 'lock-token',
      }),
    ).rejects.toBeInstanceOf(DelayedError);

    expect(moveToDelayed).toHaveBeenCalledOnce();
    const [delayedUntil, token] = moveToDelayed.mock.calls[0] ?? [];
    expect(token).toBe('lock-token');
    expect(delayedUntil).toBeGreaterThan(Date.now());
  });

  it('rethrows a host-at-capacity error when the worker has no lock token', async () => {
    const error = new WebhookDeliveryHostAtCapacity('example.com');

    await expect(
      deferWebhookDeliveryWhenHostAtCapacity({
        error,
        job: { moveToDelayed: vi.fn() },
        token: undefined,
      }),
    ).rejects.toBe(error);
  });
});
