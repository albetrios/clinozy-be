import { bullmqRedisConnection } from '@/infrastructure/cache/bullmq-redis.client.js';
import { redisConnection } from '@/infrastructure/cache/redis.client.js';
import { usesSeparateBullMqRedisDatabase } from '@/infrastructure/cache/redis-url.util.js';
import { captureMessage } from '@/infrastructure/observability/sentry/sentry.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/** The one `maxmemory-policy` BullMQ is safe on: Redis refuses writes when full, it never evicts. */
const SAFE_EVICTION_POLICY = 'noeviction';

/** `maxmemory_policy` and `maxmemory` from a Redis `INFO memory` reply; `null` when absent. */
function readMemorySettings(info: string): { policy: string | null; maxMemory: number | null } {
  const policy = /^maxmemory_policy:(\S+)/m.exec(info)?.[1] ?? null;
  const maxMemoryText = /^maxmemory:(\d+)/m.exec(info)?.[1];
  return { policy, maxMemory: maxMemoryText === undefined ? null : Number(maxMemoryText) };
}

/**
 * Refuses to boot when Redis evicts keys under memory pressure.
 *
 * @remarks
 * - **Algorithm:** reads `INFO memory`. `noeviction` passes; so does any policy while `maxmemory` is
 *   0 (no limit, so nothing is ever evicted). Any other policy with a limit throws.
 * - **Failure modes:** throws `redis.eviction_policy.unsafe`. An evicting cache drops idempotency
 *   placeholders (a replay runs the handler twice) and an evicting BullMQ Redis drops job hashes
 *   and lock keys (jobs vanish, or a live job's lock disappears and a second worker runs it). An
 *   unreadable `INFO` (some managed Redis restrict it) only warns — the same on the API and the worker.
 * - **Side effects:** one `INFO memory`; a log line with the policy.
 * - **Notes:** both boot paths call {@link assertRedisEvictionPolicies}, which checks `REDIS_URL`
 *   and, when BullMQ uses a separate endpoint, `REDIS_BULLMQ_URL`. With `noeviction` a full Redis
 *   rejects writes instead — loud, recoverable, and what the Redis memory alerts watch for.
 */
export async function assertRedisEvictionPolicy(options: {
  client: { info(section: string): Promise<string> };
  endpointName: string;
}): Promise<void> {
  let info: string;
  try {
    info = await options.client.info('memory');
  } catch (error) {
    warnUnreadableEvictionPolicy({
      endpointName: options.endpointName,
      error: error instanceof Error ? error.message : error,
    });
    return;
  }
  const { policy, maxMemory } = readMemorySettings(info);
  if (policy === null) {
    warnUnreadableEvictionPolicy({ endpointName: options.endpointName });
    return;
  }
  if (policy === SAFE_EVICTION_POLICY || maxMemory === 0) {
    logger.info({ endpoint: options.endpointName, policy, maxMemory }, 'redis.eviction_policy.ok');
    return;
  }
  throw new Error(
    `redis.eviction_policy.unsafe: ${options.endpointName} runs maxmemory-policy "${policy}" ` +
      `with a ${maxMemory ?? 'set'}-byte limit. Idempotency keys and BullMQ need ` +
      `"${SAFE_EVICTION_POLICY}": an evicting Redis drops keys when memory fills, so a write can ` +
      'run twice and a job can vanish or run twice. ' +
      'Set maxmemory-policy noeviction on the Redis server. ' +
      'See docs/deployment/runbooks/redis-topology.md.',
  );
}

/**
 * Checks every Redis this process depends on for an evicting `maxmemory-policy`.
 *
 * @remarks
 * Always checks the cache client (`REDIS_URL`). When BullMQ uses a separate endpoint it also
 * checks that client (`REDIS_BULLMQ_URL`), after the cache check. A shared endpoint is one Redis,
 * so the cache check covers BullMQ too. Both the API and the worker call this after their connects.
 */
export async function assertRedisEvictionPolicies(): Promise<void> {
  await assertRedisEvictionPolicy({ client: redisConnection, endpointName: 'REDIS_URL' });
  if (!usesSeparateBullMqRedisDatabase()) return;
  await assertRedisEvictionPolicy({
    client: bullmqRedisConnection,
    endpointName: 'REDIS_BULLMQ_URL',
  });
}

/** Logs and reports an unreadable `INFO memory` without refusing to boot. */
function warnUnreadableEvictionPolicy(options: { endpointName: string; error?: unknown }): void {
  logger.warn(
    { endpoint: options.endpointName, error: options.error },
    'redis.eviction_policy.unreadable',
  );
  captureMessage('redis.eviction_policy.unreadable', {
    level: 'warning',
    extra: { endpoint: options.endpointName, error: options.error },
  });
}
