import type { FastifyPluginAsync, FastifyReply, FastifyRequest, RouteOptions } from 'fastify';
import fp from 'fastify-plugin';
import { eventBus } from '@/core/events/event-bus.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { idempotencyOnResponse } from './idempotency.middleware.js';

/** Requests whose post-response steps already ran (once per request, whichever trigger fires first). */
const finalizedRequests = new WeakSet<FastifyRequest>();

/**
 * The two post-response steps, in order and at most once per request: persist the idempotency
 * cache entry (a 2xx caches its response, anything else releases the placeholder so the client may
 * retry), then flush the post-commit dispatch tasks (enqueue BullMQ side-effect jobs). Both are
 * best-effort — a failure is logged and never fails the response.
 */
async function finalizeRequestLifecycle(request: FastifyRequest, reply: FastifyReply) {
  if (finalizedRequests.has(request)) return;
  finalizedRequests.add(request);

  try {
    await idempotencyOnResponse(request, reply);
  } catch (error) {
    logger.warn({ error, requestId: request.id }, 'request.lifecycle.idempotency_failed');
  }

  try {
    await eventBus.flushOnCommit({ requestId: request.id });
  } catch (error) {
    logger.warn({ error, requestId: request.id }, 'request.lifecycle.outbox_flush_failed');
  }
}

/**
 * Route-level `onSend`, so it runs after every instance-level `onSend` (the idempotency snapshot
 * among them): once the handler has its response, a client that is already gone — or leaves before
 * the response is written — never produces `finish`, and Fastify then never runs `onResponse`.
 */
async function finalizeWhenTheClientLeaves(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
): Promise<unknown> {
  if (reply.raw.destroyed) {
    await finalizeRequestLifecycle(request, reply);
    return payload;
  }
  reply.raw.once('close', () => {
    if (!reply.raw.writableFinished) void finalizeRequestLifecycle(request, reply);
  });
  return payload;
}

/**
 * Request lifecycle coordinator.
 *
 * Owns the post-response ordering for write-side effects. Fastify `onResponse` hooks run FIFO;
 * this plugin is registered FIRST in `middlewarePlugins` so its hook fires before any other
 * `onResponse` and sequences the two steps:
 *
 *   1. Persist the idempotency cache entry (a 2xx caches its response, anything else releases
 *      the placeholder so the client may retry).
 *   2. Flush the post-commit dispatch tasks (enqueue BullMQ side-effect jobs).
 *
 * A client that disconnects before its response is written never gets `onResponse`: the same steps
 * then run from a route-level `onSend` (or the socket's `close`), once the handler has finished —
 * never earlier, so a retry cannot run alongside a write still in progress. Without it the
 * placeholder stayed until its TTL and the side-effect jobs were never enqueued.
 *
 * There is no request-wide database transaction to wait for: each unit of work commits inside
 * `withAppDatabaseContext` before the response is sent. Both steps are best-effort — a failure is
 * logged and never fails the already-sent response.
 */
const requestLifecycleMiddleware: FastifyPluginAsync = async (app) => {
  app.addHook('onRoute', (routeOptions: RouteOptions) => {
    const existingOnSend = (() => {
      if (routeOptions.onSend === undefined) return [];
      if (Array.isArray(routeOptions.onSend)) return [...routeOptions.onSend];
      return [routeOptions.onSend];
    })();
    routeOptions.onSend = [...existingOnSend, finalizeWhenTheClientLeaves];
  });

  app.addHook('onResponse', finalizeRequestLifecycle);
};

export default fp(requestLifecycleMiddleware, { name: 'request-lifecycle-middleware' });
