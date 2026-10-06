import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test for production hardening item #1 — hook-order lifecycle.
 *
 * Asserts the request lifecycle coordinator runs its onResponse steps in order — the idempotency
 * cache write, then the post-commit dispatch flush — and that each is best-effort: a failure in
 * one never skips the other or fails the already-sent response. There is no request-wide
 * transaction to settle first: every unit of work has committed before the response is sent.
 */

const callOrder: string[] = [];

const idempotencyOnResponseMock = vi.fn(async () => {
  callOrder.push('idempotency');
});

const flushOnCommitMock = vi.fn(async () => {
  callOrder.push('outbox_flush');
});

vi.mock('@/shared/middlewares/core/idempotency.middleware.js', () => ({
  default: async () => {
    /* not registered in this test */
  },
  idempotencyOnResponse: idempotencyOnResponseMock,
}));

vi.mock('@/core/events/event-bus.js', () => ({
  eventBus: {
    flushOnCommit: flushOnCommitMock,
  },
  enterOnCommitScope: vi.fn(),
}));

async function buildApplication(): Promise<FastifyInstance> {
  const { default: requestLifecycleMiddleware } = await import(
    '@/shared/middlewares/core/request-lifecycle.middleware.js'
  );
  const application = Fastify({ logger: false });
  await application.register(requestLifecycleMiddleware);
  application.post('/probe', async () => ({ ok: true }));
  await application.ready();
  return application;
}

describe('request-lifecycle middleware: onResponse step ordering', () => {
  beforeEach(() => {
    callOrder.length = 0;
    idempotencyOnResponseMock.mockClear();
    flushOnCommitMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs idempotency → outbox-flush in that order', async () => {
    const application = await buildApplication();

    const response = await application.inject({ method: 'POST', url: '/probe' });
    expect(response.statusCode).toBe(200);

    expect(idempotencyOnResponseMock).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      expect.anything(),
    );
    expect(flushOnCommitMock).toHaveBeenCalledExactlyOnceWith({ requestId: expect.any(String) });
    expect(callOrder).toEqual(['idempotency', 'outbox_flush']);

    await application.close();
  });

  it('still flushes the outbox when the idempotency cache write throws', async () => {
    idempotencyOnResponseMock.mockImplementationOnce(async () => {
      callOrder.push('idempotency_threw');
      throw new Error('cache_boom');
    });
    const application = await buildApplication();

    const response = await application.inject({ method: 'POST', url: '/probe' });
    expect(response.statusCode).toBe(200);
    expect(callOrder).toEqual(['idempotency_threw', 'outbox_flush']);

    await application.close();
  });

  it('swallows an outbox flush failure — the response is already sent', async () => {
    flushOnCommitMock.mockImplementationOnce(async () => {
      callOrder.push('outbox_flush_threw');
      throw new Error('flush_boom');
    });
    const application = await buildApplication();

    const response = await application.inject({ method: 'POST', url: '/probe' });
    expect(response.statusCode).toBe(200);
    expect(callOrder).toEqual(['idempotency', 'outbox_flush_threw']);

    await application.close();
  });
});
