import { randomUUID } from 'node:crypto';
import { redisConnection } from '@/infrastructure/cache/redis.client.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/**
 * Claims one slot of a counting semaphore held as a sorted set (member = the holder's nonce, score =
 * when its claim lapses): drops the lapsed claims, refuses when `limit` are held, else adds ours.
 * KEYS[1] = the set; ARGV = now (ms), limit, lapses-at (ms), nonce, TTL (ms).
 */
const REDIS_SEMAPHORE_ACQUIRE_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[3], ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[5])
return 1`;

/**
 * Thrown by {@link withRedisSemaphore} when every slot is taken.
 *
 * @remarks
 * Callers turn it into their own answer (a 429 with `Retry-After` for an export, D-4). It signals
 * contention, never a Redis outage — a Redis error while claiming propagates unchanged.
 */
export class RedisSemaphoreFullError extends Error {
  constructor(public readonly semaphoreKey: string) {
    super(`redis semaphore full: ${semaphoreKey}`);
    this.name = 'RedisSemaphoreFullError';
  }
}

/** Options for {@link withRedisSemaphore}. */
export interface RedisSemaphoreOptions {
  /** Fully-qualified Redis key of the semaphore (caller owns the namespace). */
  key: string;
  /** How many holders may run at once. */
  limit: number;
  /** How long a claim lasts, in seconds — it lapses on its own if the holder dies. */
  ttlSeconds: number;
}

/**
 * Runs `fn` while holding one of `limit` slots of a distributed counting semaphore.
 *
 * @remarks
 * - **Algorithm:** one Lua call drops the claims past their TTL, refuses when `limit` remain and
 *   otherwise adds this holder's nonce (scored with when it lapses) — atomic, so two callers never
 *   take the last slot together. `fn` runs; the claim is removed in a `finally`.
 * - **Failure modes:** {@link RedisSemaphoreFullError} when every slot is held; a Redis error while
 *   claiming propagates (the caller fails closed); `fn`'s errors propagate after the release. A
 *   failed release only logs — the claim lapses with its TTL.
 * - **Side effects:** `EVAL` and `ZREM` on Redis; whatever `fn` does.
 */
export async function withRedisSemaphore<T>({
  options,
  fn,
}: {
  options: RedisSemaphoreOptions;
  fn: () => Promise<T>;
}): Promise<T> {
  const { key, limit, ttlSeconds } = options;
  const nonce = randomUUID();
  const now = Date.now();
  const ttlMilliseconds = ttlSeconds * 1000;
  const claimed = await redisConnection.eval(
    REDIS_SEMAPHORE_ACQUIRE_LUA,
    1,
    key,
    String(now),
    String(limit),
    String(now + ttlMilliseconds),
    nonce,
    String(ttlMilliseconds),
  );
  if (Number(claimed) !== 1) throw new RedisSemaphoreFullError(key);
  try {
    return await fn();
  } finally {
    await redisConnection.zrem(key, nonce).catch((error: unknown) => {
      logger.warn({ error, key }, 'redis-semaphore.release.failed');
    });
  }
}
