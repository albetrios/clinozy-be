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
 * - **Notes:** the API calls this on `REDIS_URL` after `connectRedis`. The worker calls it on the
 *   Redis BullMQ uses (`REDIS_BULLMQ_URL` when that endpoint is separate, otherwise `REDIS_URL`).
 *   With `noeviction` a full Redis rejects writes instead — loud, recoverable, and what the Redis
 *   memory alerts watch for.
 */
export async function assertRedisEvictionPolicy(options: {
  client: { info(section: string): Promise<string> };
  endpointName: string;
}): Promise<void> {
  let info: string;
  try {
    info = await options.client.info('memory');
  } catch (error) {
    logger.warn(
      { endpoint: options.endpointName, error: error instanceof Error ? error.message : error },
      'redis.eviction_policy.unreadable',
    );
    return;
  }
  const { policy, maxMemory } = readMemorySettings(info);
  if (policy === null) {
    logger.warn({ endpoint: options.endpointName }, 'redis.eviction_policy.unreadable');
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
