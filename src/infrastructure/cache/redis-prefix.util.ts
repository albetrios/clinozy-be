import { getEnv } from '@/shared/config/env.config.js';
import { REDIS_KEY_PREFIX_STEM } from '@/shared/constants/project-identity.constants.js';

/**
 * Resolves the Redis key prefix for cache, idempotency, rate limits, and BullMQ.
 * Defaults to `<product>:<NODE_ENV>:` (e.g. `clinozy:production:`) when REDIS_KEY_PREFIX is unset.
 *
 * @remarks
 * The product comes from the generated identity stem, so a rebrand renames every key with it.
 * `NODE_ENV` is the full environment name (`local` / `development` / `production`), so each
 * environment on a shared Redis gets its own namespace without any configuration. Set
 * `REDIS_KEY_PREFIX` only when several deployments with the same `NODE_ENV` share one Redis.
 */
export function resolveRedisKeyPrefix(): string {
  const environment = getEnv();
  const override = environment.REDIS_KEY_PREFIX;
  if (override !== undefined && override.length > 0) {
    return override.endsWith(':') ? override : `${override}:`;
  }
  return `${REDIS_KEY_PREFIX_STEM}:${environment.NODE_ENV}:`;
}
