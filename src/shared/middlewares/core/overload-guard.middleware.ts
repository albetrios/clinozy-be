import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '@/shared/config/env.config.js';
import { ServiceUnavailableError } from '@/shared/errors/index.js';
import { getSharedEventLoopHistogram } from '@/shared/utils/infrastructure/event-loop-monitor.js';
import {
  getActiveOrganizationRlsCheckoutCount,
  getOldestConnectionWaitMs,
} from '@/infrastructure/database/pool/organization-rls-checkout-counter.js';

/** Sampling cadence for the event-loop-delay probe (ms). */
const OVERLOAD_SAMPLE_INTERVAL_MS = 500;

/** `Retry-After` (seconds) advertised on a shed 503 so clients back off instead of hot-looping. */
const OVERLOAD_RETRY_AFTER_SECONDS = 1;

/**
 * Paths never shed: liveness/readiness must answer so the orchestrator does not kill or de-route a
 * process that is merely busy, and `/metrics` must stay scrapable during overload.
 */
const OVERLOAD_ALLOWLISTED_PATHS = new Set(['/livez', '/readyz', '/metrics']);

/**
 * Pure shed decision for the overload guard: returns `true` when a request should be rejected
 * with 503.
 *
 * @remarks
 * Allowlisted paths ({@link OVERLOAD_ALLOWLISTED_PATHS}) are never shed; any other path sheds when
 * EITHER the recent p99 event-loop delay has reached `thresholdMs` (CPU/sync-stall saturation) OR
 * the in-flight organization-RLS pool checkouts have reached `dbCheckoutShedThreshold` (DB-pool saturation —
 * a distinct mode the event-loop signal cannot see, since waiting on a pooled connection leaves the
 * loop idle) OR the oldest unit of work still waiting for a connection has waited
 * `connectionWaitShedMs` (a slow database: the queue is short but does not drain).
 * `dbCheckoutShedThreshold <= 0` / `connectionWaitShedMs <= 0` disable those conditions. Extracted as
 * a pure function so the decision is unit-testable without driving the real event loop or fake timers.
 */
export function shouldShedRequest(options: {
  path: string;
  recentEventLoopDelayMs: number;
  thresholdMs: number;
  activeDbCheckouts: number;
  dbCheckoutShedThreshold: number;
  oldestConnectionWaitMs: number;
  connectionWaitShedMs: number;
}): boolean {
  return resolveShedReason(options) !== null;
}

/** Why a request is shed ({@link shouldShedRequest}), or `null` when it is served. */
function resolveShedReason(options: Parameters<typeof shouldShedRequest>[0]) {
  if (OVERLOAD_ALLOWLISTED_PATHS.has(options.path)) {
    return null;
  }
  if (options.recentEventLoopDelayMs >= options.thresholdMs) {
    return 'event_loop_overload';
  }
  if (
    options.dbCheckoutShedThreshold > 0 &&
    options.activeDbCheckouts >= options.dbCheckoutShedThreshold
  ) {
    return 'database_pool_overload';
  }
  if (
    options.connectionWaitShedMs > 0 &&
    options.oldestConnectionWaitMs >= options.connectionWaitShedMs
  ) {
    return 'database_pool_wait_overload';
  }
  return null;
}

/**
 * Load-shedding valve: returns `503 Service Unavailable` (with `Retry-After`) on `onRequest` when
 * recent p99 event-loop delay exceeds the configured `OVERLOAD_MAX_EVENT_LOOP_DELAY_MS` (env).
 *
 * @remarks
 * - **Algorithm:** sheds on either of two independent saturation signals. (1) CPU/sync stall: a
 *   shared `monitorEventLoopDelay` histogram is sampled every {@link OVERLOAD_SAMPLE_INTERVAL_MS}
 *   and reset each tick; the `onRequest` hook reads the cached p99 (no per-request syscall) and
 *   sheds above `env.OVERLOAD_MAX_EVENT_LOOP_DELAY_MS`. (2) DB-pool saturation: the hook reads the
 *   live in-process checkout gauge — units of work running or still waiting for a connection — and
 *   sheds at `ceil(DATABASE_POOL_MAX × shedRatio)`. The default ratio (10) lets a queue nine times
 *   the pool's size form first, so a burst the pool drains in milliseconds is served, not shed.
 *   (3) A slow database: the oldest unit of work still waiting for a connection has waited
 *   `env.OVERLOAD_DB_ACQUIRE_WAIT_SHED_MS` — new requests get a fast 503 instead of queuing behind
 *   it until `DATABASE_POOL_ACQUIRE_TIMEOUT_MS` fails them slowly. All throw
 *   {@link ServiceUnavailableError} with `Retry-After`.
 * - **Why:** without a valve, a backlog grows an unbounded queue and tail latency runs to multiple
 *   seconds. Shedding bounds the tail — requests the box cannot serve promptly get a fast, cheap
 *   503 instead of occupying a worker for seconds. Rejections carry an internal reason
 *   (`event_loop_overload`, `database_pool_overload` or `database_pool_wait_overload`) in the
 *   structured error-handler log;
 *   the 5xx response does not expose it. The event-loop signal alone is blind to pool
 *   exhaustion: a request awaiting a pooled connection leaves the loop *idle*, so without the pool
 *   condition requests would queue behind postgres.js (which has no acquire timeout of its own)
 *   until `DATABASE_POOL_ACQUIRE_TIMEOUT_MS`. The pool ratio (`env.OVERLOAD_DB_POOL_SHED_RATIO`,
 *   `0` disables) is decoupled from the alerter's `DATABASE_POOL_ACTIVE_CRITICAL_RATIO` so shedding
 *   tunes independently.
 * - **Failure modes:** none surfaced to healthy traffic — at sane thresholds the guard is dormant
 *   under normal load. Allowlisted health/metrics paths are never shed.
 * - **Side effects:** one shared `monitorEventLoopDelay` histogram + one unref'd interval timer
 *   (both cleared on `onClose`); the histogram is reset on `onReady` so the boot's own stall is
 *   never sampled as load; reads an in-process counter; throws on shed.
 */
const overloadGuardMiddleware: FastifyPluginAsync = async (application) => {
  const shedThresholdMs = env.OVERLOAD_MAX_EVENT_LOOP_DELAY_MS;
  // Precompute the absolute checkout count at which to shed (0 ⇒ pool-saturation shedding disabled).
  const dbCheckoutShedThreshold =
    env.OVERLOAD_DB_POOL_SHED_RATIO > 0
      ? Math.ceil(env.DATABASE_POOL_MAX * env.OVERLOAD_DB_POOL_SHED_RATIO)
      : 0;
  let recentEventLoopDelayMs = 0;
  const histogram = getSharedEventLoopHistogram();

  const sampleTimer = setInterval(() => {
    recentEventLoopDelayMs = histogram.percentile(99) / 1_000_000;
    histogram.reset();
  }, OVERLOAD_SAMPLE_INTERVAL_MS);
  sampleTimer.unref();
  // The histogram starts recording at registration, so the boot itself — importing modules,
  // compiling route schemas, between the I/O awaits that keep the loop turning — would land in the
  // first sample as one long stall and shed the first requests a fresh process serves. That stall
  // is the boot, not load: open the first sample window when the application is ready.
  application.addHook('onReady', async () => {
    histogram.reset();
    recentEventLoopDelayMs = 0;
  });
  application.addHook('onClose', async () => {
    clearInterval(sampleTimer);
  });

  application.addHook('onRequest', async (request) => {
    const shedReason = resolveShedReason({
      path: request.url.split('?', 1)[0] ?? '',
      recentEventLoopDelayMs,
      thresholdMs: shedThresholdMs,
      activeDbCheckouts: getActiveOrganizationRlsCheckoutCount(),
      dbCheckoutShedThreshold,
      oldestConnectionWaitMs: getOldestConnectionWaitMs(),
      connectionWaitShedMs: env.OVERLOAD_DB_ACQUIRE_WAIT_SHED_MS,
    });
    if (shedReason !== null) {
      // Internal reason is logged by the error handler; 5xx responses never expose it.
      throw new ServiceUnavailableError()
        .withReason(shedReason)
        .withRetryAfter(OVERLOAD_RETRY_AFTER_SECONDS);
    }
  });
};

export default fp(overloadGuardMiddleware, { name: 'overload-guard-middleware' });
