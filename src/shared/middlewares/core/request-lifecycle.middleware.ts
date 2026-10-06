import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { eventBus } from '@/core/events/event-bus.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { idempotencyOnResponse } from './idempotency.middleware.js';

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
 * There is no request-wide database transaction to wait for: each unit of work commits inside
 * `withAppDatabaseContext` before the response is sent. Both steps are best-effort — a failure is
 * logged and never fails the already-sent response.
 */
const requestLifecycleMiddleware: FastifyPluginAsync = async (app) => {
  app.addHook('onResponse', async (request, reply) => {
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
  });
};

export default fp(requestLifecycleMiddleware, { name: 'request-lifecycle-middleware' });
