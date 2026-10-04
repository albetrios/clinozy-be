import { randomInt } from 'node:crypto';
import CircuitBreaker from 'opossum';
import type { WebhookDeliveryFetch } from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery.worker.js';
import { safeWebhookUrlForLogs } from '@/shared/utils/security/safe-webhook-url-for-logs.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  FIVE_SECONDS_MS,
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
  TEN_SECONDS_MS,
} from '@/shared/constants/ttl.constants.js';

const WEBHOOK_FETCH_TIMEOUT_MS = 30_000;

/** Maximum number of per-webhook circuit breakers kept resident (LRU eviction beyond this). */
const WEBHOOK_CIRCUIT_CACHE_MAX_ENTRIES = 5_000;
/** Idle time after which an unused breaker is evicted and shut down (1 hour). */
const WEBHOOK_CIRCUIT_CACHE_IDLE_TTL_MS = MILLISECONDS_PER_HOUR;

/** Extra request budget beyond the fetch timeout before Opossum trips the breaker (ms). */
const WEBHOOK_CIRCUIT_TIMEOUT_BUFFER_MS = FIVE_SECONDS_MS;
/** Opossum error-rate threshold (percent) over the rolling volume before the breaker opens. */
const WEBHOOK_CIRCUIT_ERROR_THRESHOLD_PERCENTAGE = 50;
/** Time the breaker stays open before allowing a half-open trial request (ms). */
const WEBHOOK_CIRCUIT_RESET_TIMEOUT_MS = MILLISECONDS_PER_MINUTE;
/** Minimum calls in the rolling window before the error percentage is evaluated. */
const WEBHOOK_CIRCUIT_VOLUME_THRESHOLD = 5;
/** Maximum jitter added to delivery backoff, as a fraction of the base delay. */
const WEBHOOK_DELIVERY_BACKOFF_JITTER_RATIO = 0.3;

/** Cache entry pairing a breaker with the last time it was accessed (for idle-TTL eviction). */
type WebhookCircuitCacheEntry = {
  circuit: CircuitBreaker;
  lastAccessedAtMs: number;
};

/**
 * Bounded LRU+TTL cache of circuit breakers keyed by webhook public id (not URL). Insertion
 * order tracks access recency because every read re-inserts the touched entry, so the front of
 * the map is always the least-recently-used. Keying by id means a URL change reuses the same
 * breaker instead of orphaning the old one, and the cap + idle TTL bound worker memory. The
 * public id, not the bigserial: that restarts at 1 after `TRUNCATE ... RESTART IDENTITY` or a
 * database restore, and a new webhook reusing it would inherit the old one's open breaker.
 */
const circuitsByWebhookPublicId = new Map<string, WebhookCircuitCacheEntry>();

async function executeWebhookFetch(
  webhookUrl: string,
  init: RequestInit,
  fetchImplementation: WebhookDeliveryFetch,
): Promise<Response> {
  return fetchImplementation(webhookUrl, init);
}

function attachCircuitEventListeners(
  circuit: CircuitBreaker,
  logContext: { webhookPublicId: string; webhookUrl: string },
): void {
  const safeUrl = safeWebhookUrlForLogs(logContext.webhookUrl);
  const redactedContext = { webhookPublicId: logContext.webhookPublicId, ...safeUrl };

  circuit.on('open', () => {
    logger.warn(redactedContext, 'webhook.outbound.circuit.open');
  });

  circuit.on('halfOpen', () => {
    logger.info(redactedContext, 'webhook.outbound.circuit.half_open');
  });

  circuit.on('close', () => {
    logger.info(redactedContext, 'webhook.outbound.circuit.closed');
  });
}

/** Touch an entry so it becomes most-recently-used (move-to-end + refresh timestamp). */
function touchCircuitCacheEntry(
  webhookPublicId: string,
  entry: WebhookCircuitCacheEntry,
  nowMs: number,
): void {
  entry.lastAccessedAtMs = nowMs;
  circuitsByWebhookPublicId.delete(webhookPublicId);
  circuitsByWebhookPublicId.set(webhookPublicId, entry);
}

/** Evict idle entries from the front of the map (least-recently-used first). */
function evictExpiredCircuits(nowMs: number): void {
  for (const [webhookPublicId, entry] of circuitsByWebhookPublicId) {
    if (nowMs - entry.lastAccessedAtMs <= WEBHOOK_CIRCUIT_CACHE_IDLE_TTL_MS) break;
    entry.circuit.shutdown();
    circuitsByWebhookPublicId.delete(webhookPublicId);
  }
}

/** Evict the least-recently-used entries until there is room for a new breaker. */
function evictLeastRecentlyUsedIfFull(): void {
  while (circuitsByWebhookPublicId.size >= WEBHOOK_CIRCUIT_CACHE_MAX_ENTRIES) {
    const oldestKey = circuitsByWebhookPublicId.keys().next().value;
    if (oldestKey === undefined) break;
    circuitsByWebhookPublicId.get(oldestKey)?.circuit.shutdown();
    circuitsByWebhookPublicId.delete(oldestKey);
  }
}

function getWebhookOutboundCircuit(webhookPublicId: string, webhookUrl: string): CircuitBreaker {
  const nowMs = Date.now();
  evictExpiredCircuits(nowMs);

  const existing = circuitsByWebhookPublicId.get(webhookPublicId);
  if (existing) {
    touchCircuitCacheEntry(webhookPublicId, existing, nowMs);
    return existing.circuit;
  }

  evictLeastRecentlyUsedIfFull();

  const circuit = new CircuitBreaker(executeWebhookFetch, {
    timeout: WEBHOOK_FETCH_TIMEOUT_MS + WEBHOOK_CIRCUIT_TIMEOUT_BUFFER_MS,
    errorThresholdPercentage: WEBHOOK_CIRCUIT_ERROR_THRESHOLD_PERCENTAGE,
    resetTimeout: WEBHOOK_CIRCUIT_RESET_TIMEOUT_MS,
    volumeThreshold: WEBHOOK_CIRCUIT_VOLUME_THRESHOLD,
    name: `webhook-outbound:${webhookPublicId}`,
  });

  attachCircuitEventListeners(circuit, { webhookPublicId, webhookUrl });
  circuitsByWebhookPublicId.set(webhookPublicId, { circuit, lastAccessedAtMs: nowMs });
  return circuit;
}

/** Options for {@link fetchWebhookWithCircuitBreaker}. */
export interface FetchWebhookWithCircuitBreakerOptions {
  /** Webhook public id — the breaker cache key (stable across URL updates and id restarts). */
  webhookPublicId: string;
  /** Target URL for this delivery; passed through to the fetch implementation. */
  webhookUrl: string;
  /** Outbound request init (method, headers, body, abort signal). */
  init: RequestInit;
  /** Pinned/allowlisted fetch implementation that performs the actual network call. */
  fetchImplementation: WebhookDeliveryFetch;
}

/**
 * Send a webhook request through a per-webhook Opossum circuit breaker (50% error threshold
 * over a volume of 5 calls, 60s reset). Breakers are cached by webhook public id in a bounded
 * LRU+TTL map so a flaky customer endpoint trips its own breaker without affecting others, while
 * URL churn and multi-tenant growth can no longer leak breakers (cap + idle eviction).
 *
 * @remarks
 * - **Algorithm:** resolve (or lazily create) the breaker for `webhookPublicId`, then `fire` it
 *   with the URL/init/fetch so Opossum tracks failures per webhook.
 * - **Failure modes:** rejects with `EOPENBREAKER` when the breaker is open; otherwise propagates
 *   the underlying fetch error.
 * - **Side effects:** mutates the in-process breaker cache (create / touch / evict + `shutdown`).
 * - **Notes:** the cache is per-process; cross-process invalidation relies on the idle TTL.
 */
export async function fetchWebhookWithCircuitBreaker(
  options: FetchWebhookWithCircuitBreakerOptions,
): Promise<Response> {
  const { webhookPublicId, webhookUrl, init, fetchImplementation } = options;
  return getWebhookOutboundCircuit(webhookPublicId, webhookUrl).fire(
    webhookUrl,
    init,
    fetchImplementation,
  ) as Promise<Response>;
}

/**
 * Drop the cached breaker for a webhook (on update/delete) so stale state does not linger.
 *
 * @remarks
 * - **Algorithm:** look up the breaker by webhook public id, `shutdown()` it, and remove the
 *   cache entry.
 * - **Failure modes:** none — a missing entry is a no-op.
 * - **Side effects:** mutates the in-process breaker cache.
 * - **Notes:** invalidation is per-process (the API process that mutates the webhook differs
 *   from the worker process holding the live breaker), so the idle TTL is the durable
 *   cross-process safety net; this call is best-effort within a single process.
 */
export function invalidateWebhookOutboundCircuit(webhookPublicId: string): void {
  const entry = circuitsByWebhookPublicId.get(webhookPublicId);
  if (entry === undefined) return;
  entry.circuit.shutdown();
  circuitsByWebhookPublicId.delete(webhookPublicId);
}

/**
 * Exponential backoff with up to 30% jitter (BullMQ custom backoff for webhook-delivery).
 *
 * @remarks
 * Jitter decorrelates retries across worker concurrency slots so simultaneous failures don't all
 * fire at the same wall clock; it is NOT a security primitive. Uses `crypto.randomInt` (never
 * `Math.random`) so static analysis doesn't flag a weak-PRNG hotspot — the draw happens once per
 * failed delivery (retries are seconds apart, not a tight loop), so the synchronous CSPRNG cost is
 * negligible. `baseDelayMs` is always ≥ `TEN_SECONDS_MS`, so the jitter ceiling is ≥ 1 and the
 * `randomInt` range is always valid.
 */
export function webhookDeliveryBackoffWithJitter(attemptsMade: number): number {
  const attemptIndex = Math.max(attemptsMade, 1);
  const baseDelayMs = TEN_SECONDS_MS * 2 ** (attemptIndex - 1);
  const jitterCeilingMs = Math.floor(baseDelayMs * WEBHOOK_DELIVERY_BACKOFF_JITTER_RATIO);
  const jitterMs = randomInt(0, jitterCeilingMs + 1);
  return baseDelayMs + jitterMs;
}

/** Clears per-webhook circuits between tests (not for production use). */
export function resetWebhookOutboundCircuitsForTesting(): void {
  for (const entry of circuitsByWebhookPublicId.values()) {
    entry.circuit.shutdown();
  }
  circuitsByWebhookPublicId.clear();
}

/** Returns the current number of cached breakers (test/observability helper). */
export function getWebhookOutboundCircuitCacheSize(): number {
  return circuitsByWebhookPublicId.size;
}
