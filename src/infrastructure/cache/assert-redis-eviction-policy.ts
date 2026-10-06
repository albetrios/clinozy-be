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
 * Refuses to start a worker on a Redis that evicts keys under memory pressure.
 *
 * @remarks
 * - **Algorithm:** reads `INFO memory`. `noeviction` passes; so does any policy while `maxmemory` is
 *   0 (no limit, so nothing is ever evicted). Any other policy with a limit throws.
 * - **Failure modes:** throws `redis.eviction_policy.unsafe` — an evicting Redis drops BullMQ job
 *   hashes and lock keys at the worst moment (memory is full because a backlog built up): jobs
 *   vanish, or a live job's lock disappears and a second worker runs it again. An unreadable
 *   `INFO` (some managed Redis restrict it) only warns.
 * - **Side effects:** one `INFO memory`; a log line with the policy.
 * - **Notes:** runs at worker boot, on the Redis BullMQ uses. With `noeviction` a full Redis
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
      `with a ${maxMemory ?? 'set'}-byte limit. BullMQ needs "${SAFE_EVICTION_POLICY}": an evicting ` +
      'Redis drops job data and lock keys when memory fills, losing jobs or running them twice. ' +
      'Set maxmemory-policy noeviction on the Redis server. ' +
      'See docs/deployment/runbooks/redis-topology.md.',
  );
}
