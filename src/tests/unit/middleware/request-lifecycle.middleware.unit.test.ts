import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
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
  // Registered after the coordinator, like the idempotency snapshot: its onSend runs earlier.
  application.addHook('onSend', async (_request, _reply, payload) => {
    callOrder.push('instance_on_send');
    return payload;
  });
  application.post('/probe', async () => ({ ok: true }));
  application.post('/slow', async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    callOrder.push('handler_done');
    return { ok: true };
  });
  await application.ready();
  return application;
}

/** Sends `POST /slow` to a listening server and disconnects while the handler is still running. */
async function abortWhileTheHandlerRuns(application: FastifyInstance): Promise<void> {
  await application.listen({ port: 0, host: '127.0.0.1' });
  const { port } = application.server.address() as AddressInfo;
  await new Promise<void>((resolve) => {
    const clientRequest = httpRequest({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/slow',
      headers: { 'content-type': 'application/json' },
    });
    clientRequest.on('error', () => resolve());
    clientRequest.on('close', () => resolve());
    clientRequest.end('{}');
    setTimeout(() => clientRequest.destroy(), 30);
  });
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
    expect(callOrder).toEqual(['instance_on_send', 'idempotency', 'outbox_flush']);

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
    expect(callOrder).toEqual(['instance_on_send', 'idempotency_threw', 'outbox_flush']);

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
    expect(callOrder).toEqual(['instance_on_send', 'idempotency', 'outbox_flush_threw']);

    await application.close();
  });

  it('still runs both steps, once, when the client disconnects before the handler finishes', async () => {
    const application = await buildApplication();

    await abortWhileTheHandlerRuns(application);
    // Fastify never runs onResponse for a response that cannot be written: without the fallback
    // the idempotency placeholder outlived the write and the side-effect jobs were never enqueued.
    await vi.waitFor(() => expect(flushOnCommitMock).toHaveBeenCalledOnce());

    expect(idempotencyOnResponseMock).toHaveBeenCalledOnce();
    // After the handler and every instance-level onSend (the idempotency snapshot), never before.
    expect(callOrder).toEqual(['handler_done', 'instance_on_send', 'idempotency', 'outbox_flush']);

    await application.close();
  });

  it('runs the steps once on a normal response over a real socket (finish, then close)', async () => {
    const application = await buildApplication();
    await application.listen({ port: 0, host: '127.0.0.1' });

    const response = await fetch(
      `http://127.0.0.1:${(application.server.address() as AddressInfo).port}/probe`,
      {
        method: 'POST',
      },
    );
    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(flushOnCommitMock).toHaveBeenCalledOnce());
    await application.close();

    expect(idempotencyOnResponseMock).toHaveBeenCalledOnce();
    expect(flushOnCommitMock).toHaveBeenCalledOnce();
  });
});
