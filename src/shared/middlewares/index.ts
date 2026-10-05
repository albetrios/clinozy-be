import type { FastifyInstance } from 'fastify';
import requestLifecycleMiddleware from './core/request-lifecycle.middleware.js';
import compressMiddleware from './core/compress.middleware.js';
import cookieMiddleware from './session/cookie.middleware.js';
import helmetMiddleware from './security/helmet.middleware.js';
import corsMiddleware from './security/cors.middleware.js';
import rateLimitMiddleware from './rate-limit/rate-limit.middleware.js';
import errorHandlerMiddleware from './core/error-handler.middleware.js';
import overloadGuardMiddleware from './core/overload-guard.middleware.js';
import responseFormatMiddleware from './core/response-format.middleware.js';
import apiVersioningMiddleware from './core/api-versioning.middleware.js';
import requestContextMiddleware from './core/request-context.middleware.js';
import serverTimingMiddleware from './core/server-timing.middleware.js';
import i18nMiddleware from './core/i18n.middleware.js';
import idempotencyMiddleware from './core/idempotency.middleware.js';
import encryptionMiddleware from './security/encryption.middleware.js';
import authMiddleware from './core/auth.middleware.js';
import zodTypeProviderMiddleware from './core/zod-type-provider.middleware.js';
import healthMiddleware from './core/health.middleware.js';
import httpMetricsPlugin from '@/infrastructure/observability/metrics/http-metrics.plugin.js';
import metricsMiddleware from './core/metrics.middleware.js';
import opsMiddleware from './core/ops.middleware.js';
import shutdownMiddleware from './core/shutdown.middleware.js';

/**
 * Ordered Fastify plugin list registered by {@link registerMiddleware}. Order
 * is significant: `requestLifecycleMiddleware` MUST be first to own the
 * `onResponse` orchestration of idempotency-cache → outbox-flush (Fastify
 * `onResponse` hooks run FIFO). No HTTP-side database transaction exists:
 * organization-scoped work runs inside `withAppDatabaseContext`, one unit of work at a time.
 */
export const middlewarePlugins = [
  // MUST be first: registers the only `onResponse` hook that orchestrates
  // idempotency-cache → outbox-flush in the correct order (Fastify onResponse hooks run FIFO).
  requestLifecycleMiddleware,
  compressMiddleware,
  cookieMiddleware,
  helmetMiddleware,
  corsMiddleware,
  errorHandlerMiddleware,
  // Load-shed valve: 503 fast when the event loop is saturated so the tail latency stays bounded
  // instead of growing an unbounded queue. Early (right after the error handler that formats its
  // thrown ServiceUnavailableError) so it sheds before auth / tenant / DB work.
  overloadGuardMiddleware,
  responseFormatMiddleware,
  apiVersioningMiddleware,
  requestContextMiddleware,
  // Emits the `Server-Timing` response header (server-side processing ms); wrapped in
  // fastify-plugin so its onSend hook applies to every route.
  serverTimingMiddleware,
  i18nMiddleware,
  idempotencyMiddleware,
  encryptionMiddleware,
  zodTypeProviderMiddleware,
  authMiddleware,
  // `rateLimitMiddleware` runs after auth so per-user / per-organization keys are available
  // (the global limiter is keyed on `request.ip`, but per-route limits need the principal).
  rateLimitMiddleware,
  healthMiddleware,
  httpMetricsPlugin,
  metricsMiddleware,
  opsMiddleware,
  shutdownMiddleware,
] as const;

/** Sequentially registers {@link middlewarePlugins} on the Fastify app; order matters. */
export async function registerMiddleware(application: FastifyInstance): Promise<void> {
  for (const plugin of middlewarePlugins) {
    await application.register(plugin);
  }
}
