import type { Redis } from 'ioredis';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/**
 * Lua script that atomically increments a rate-limit counter, sets expiry on first use,
 * and returns the current count + remaining TTL in a single round-trip.
 */
const RATE_LIMIT_INCR_SCRIPT = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
  end
  local ttl = redis.call('PTTL', KEYS[1])
  return {current, ttl >= 0 and ttl or tonumber(ARGV[1])}
`;
interface RateLimitIncrResult {
  current: number;
  ttl: number;
}

type RateLimitIncrCallback = (error: Error | null, result: RateLimitIncrResult | null) => void;

/** Subset of `@fastify/rate-limit`'s route options passed to `store.child`. */
interface RateLimitChildOptions {
  routeInfo?: { method?: string; url?: string };
}

/**
 * Logical key prefix of every rate-limit counter (route-scoped children append
 * `<METHOD><url>-`); the Redis client adds its own namespace prefix in front.
 */
export const RATE_LIMIT_KEY_PREFIX = 'fastify-rate-limit-';
const LOCAL_COUNTER_MAX_KEYS = 10_000;
const FAILOVER_LOG_INTERVAL_MS = 5_000;

let lastFailoverLogAtMs = 0;

function logRedisFailover(error: unknown): void {
  const now = Date.now();
  if (now - lastFailoverLogAtMs < FAILOVER_LOG_INTERVAL_MS) {
    return;
  }
  lastFailoverLogAtMs = now;
  logger.warn({ error }, 'rate_limit.redis_failover.local');
}

/**
 * Maps a process-local hit count onto the shared budget so N API replicas do not grant N times
 * `max` while Redis is down.
 *
 * A budget smaller than the replica count cannot be split without either refusing every process's
 * first request or exceeding `max`. That case keeps the local count, which is still one process's
 * `max` rather than a coordinated cluster total.
 */
export function scaleProcessLocalRateLimitCount(options: {
  localCount: number;
  max: number;
  replicaCount: number;
}): number {
  const { localCount, max, replicaCount } = options;
  if (replicaCount <= 1) return localCount;
  if (Math.floor(max / replicaCount) < 1) return localCount;
  return localCount * replicaCount;
}

/**
 * `@fastify/rate-limit` store that counts in Redis but transparently falls over to a
 * per-process in-memory fixed-window counter when Redis is unavailable.
 *
 * @remarks
 * - **Algorithm:** `incr` runs an atomic Lua script (`INCR` + conditional `PEXPIRE` + `PTTL`)
 *   in a single Redis round-trip, falling back to a local `Map` counter on any Redis rejection.
 *   The local count is scaled by the API replica count ({@link scaleProcessLocalRateLimitCount})
 *   so the plugin's `max` still means the cluster budget. `child` returns a new store with a
 *   route-scoped key prefix so per-route presets keep isolated buckets.
 * - **Failure modes:** none surfaced to the caller — Redis errors are caught and converted into
 *   local enforcement, so the limiter never throws (and never has to fail fully open).
 * - **Side effects:** writes Redis keys; maintains a bounded in-memory counter map capped at
 *   {@link LOCAL_COUNTER_MAX_KEYS}; emits a rate-limited `rate_limit.redis_failover.local`
 *   warning while degraded.
 * - **Notes:** the local fallback is process-local. Scaling by `DEPLOYMENT_API_REPLICA_COUNT`
 *   (or `DEPLOYMENT_TOTAL_REPLICA_COUNT` when the split count is unset) keeps N replicas from
 *   granting N times the configured budget. Redis counts are not scaled — they are already shared.
 */
class RedisFallbackRateLimitStore {
  private readonly localCounters = new Map<string, { count: number; expiresAtMs: number }>();

  constructor(
    private readonly redis: Redis,
    private readonly keyPrefix: string,
    private readonly replicaCount: number,
  ) {}

  incr(key: string, callback: RateLimitIncrCallback, timeWindow: number, _max: number): void {
    const fullKey = `${this.keyPrefix}${key}`;
    this.incrInRedis(fullKey, timeWindow)
      .then((result) => callback(null, result))
      .catch((error) => {
        logRedisFailover(error);
        callback(null, this.incrInMemory(fullKey, timeWindow, _max));
      });
  }

  private async incrInRedis(fullKey: string, timeWindow: number): Promise<RateLimitIncrResult> {
    const result = (await this.redis.eval(
      RATE_LIMIT_INCR_SCRIPT,
      1,
      fullKey,
      String(timeWindow),
    )) as [number, number];
    const [current, ttl] = result;
    return { current, ttl };
  }

  private incrInMemory(fullKey: string, timeWindow: number, max: number): RateLimitIncrResult {
    const now = Date.now();
    const existing = this.localCounters.get(fullKey);
    if (!existing || existing.expiresAtMs <= now) {
      this.ensureLocalCounterCapacity(now);
      this.localCounters.set(fullKey, { count: 1, expiresAtMs: now + timeWindow });
      return {
        current: scaleProcessLocalRateLimitCount({
          localCount: 1,
          max,
          replicaCount: this.replicaCount,
        }),
        ttl: timeWindow,
      };
    }
    existing.count += 1;
    return {
      current: scaleProcessLocalRateLimitCount({
        localCount: existing.count,
        max,
        replicaCount: this.replicaCount,
      }),
      ttl: existing.expiresAtMs - now,
    };
  }

  private ensureLocalCounterCapacity(now: number): void {
    if (this.localCounters.size < LOCAL_COUNTER_MAX_KEYS) {
      return;
    }

    this.pruneExpiredLocalCounters(now);
    while (this.localCounters.size >= LOCAL_COUNTER_MAX_KEYS) {
      const oldestKey = this.localCounters.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }
      this.localCounters.delete(oldestKey);
    }
  }

  private pruneExpiredLocalCounters(now: number): void {
    for (const [key, value] of this.localCounters) {
      if (value.expiresAtMs <= now) {
        this.localCounters.delete(key);
      }
    }
  }

  child(routeOptions: RateLimitChildOptions): RedisFallbackRateLimitStore {
    const routeInfo = routeOptions.routeInfo ?? {};
    const childPrefix = `${this.keyPrefix}${routeInfo.method ?? ''}${routeInfo.url ?? ''}-`;
    return new RedisFallbackRateLimitStore(this.redis, childPrefix, this.replicaCount);
  }
}

/**
 * Builds the `store` constructor `@fastify/rate-limit` instantiates (`new Store(params)`),
 * bound to `redis`. Returns a {@link RedisFallbackRateLimitStore} so Redis blips degrade to
 * per-process limiting, divided by `replicaCount`, instead of skipping enforcement entirely.
 *
 * @remarks
 * - **Algorithm:** returns a class whose constructor ignores the plugin params and closes over
 *   `redis` and `replicaCount`, delegating all counting to {@link RedisFallbackRateLimitStore}.
 * - **Failure modes:** none.
 * - **Side effects:** none at build time; the returned store performs Redis/in-memory writes.
 * - **Notes:** pass as `options.store`; do not also pass `options.redis`. `replicaCount` is
 *   `DEPLOYMENT_API_REPLICA_COUNT`, else `DEPLOYMENT_TOTAL_REPLICA_COUNT`, else 1.
 */
export function createRedisFallbackRateLimitStore(options: {
  redis: Redis;
  replicaCount: number;
}): new (
  params: unknown,
) => unknown {
  return class BoundRedisFallbackRateLimitStore extends RedisFallbackRateLimitStore {
    constructor(_params: unknown) {
      super(options.redis, RATE_LIMIT_KEY_PREFIX, options.replicaCount);
    }
  };
}

/**
 * A counter with the same Redis-then-memory behaviour as {@link createRedisFallbackRateLimitStore},
 * for a budget that is not a `@fastify/rate-limit` plugin (the per-organization request budget).
 */
export function createRateLimitCounter(options: {
  redis: Redis;
  keyPrefix: string;
  replicaCount: number;
}): {
  increment(incrementOptions: {
    key: string;
    timeWindowMs: number;
    max: number;
  }): Promise<RateLimitIncrResult>;
} {
  const store = new RedisFallbackRateLimitStore(
    options.redis,
    options.keyPrefix,
    options.replicaCount,
  );
  return {
    increment(incrementOptions) {
      return new Promise((resolve, reject) => {
        store.incr(
          incrementOptions.key,
          (error, result) => {
            if (error || !result) {
              reject(error ?? new Error('rate_limit.increment.empty'));
              return;
            }
            resolve(result);
          },
          incrementOptions.timeWindowMs,
          incrementOptions.max,
        );
      });
    },
  };
}
