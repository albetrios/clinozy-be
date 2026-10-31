import {
  RedisSemaphoreFullError,
  withRedisSemaphore,
} from '@/infrastructure/cache/redis-semaphore.util.js';
import { RateLimitedError, ServiceUnavailableError } from '@/shared/errors/index.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/** How many exports one organization may build at once (D-4). */
export const APP_EXPORT_CONCURRENCY_PER_ORGANIZATION = 2;

/** How long an export's slot lasts if its holder dies (an export reads at most 5,000 rows). */
const APP_EXPORT_SLOT_TTL_SECONDS = 120;

/** What a refused export tells the client to wait, in seconds (`Retry-After`). */
export const APP_EXPORT_RETRY_AFTER_SECONDS = 15;

/** The Redis key of an organization's export slots. */
export function appExportSlotKey(organizationPublicId: string): string {
  return `app:export-slots:${organizationPublicId}`;
}

/**
 * Builds one export inside one of the organization's {@link APP_EXPORT_CONCURRENCY_PER_ORGANIZATION}
 * export slots (D-4) — every `GET /app/…/exports` route runs its read through it.
 *
 * @remarks
 * - **Algorithm:** a Redis counting semaphore per organization ({@link withRedisSemaphore}); the
 *   slot is freed when the export is built, or lapses after two minutes.
 * - **Failure modes:** fails closed — every slot taken is a 429 `export_busy`, Redis down a 503,
 *   both with `Retry-After`; `build`'s own errors propagate.
 * - **Side effects:** two Redis calls around the export.
 */
export async function withOrganizationExportSlot<T>({
  organizationPublicId,
  build,
}: {
  organizationPublicId: string;
  build: () => Promise<T>;
}): Promise<T> {
  let slotHeld = false;
  try {
    return await withRedisSemaphore({
      options: {
        key: appExportSlotKey(organizationPublicId),
        limit: APP_EXPORT_CONCURRENCY_PER_ORGANIZATION,
        ttlSeconds: APP_EXPORT_SLOT_TTL_SECONDS,
      },
      fn: () => {
        slotHeld = true;
        return build();
      },
    });
  } catch (error) {
    if (slotHeld) throw error;
    if (error instanceof RedisSemaphoreFullError) {
      throw new RateLimitedError('errors:exportBusy')
        .withReason('export_busy')
        .withRetryAfter(APP_EXPORT_RETRY_AFTER_SECONDS);
    }
    logger.warn({ error, organizationPublicId }, 'app-export.slot.unavailable');
    throw new ServiceUnavailableError().withRetryAfter(APP_EXPORT_RETRY_AFTER_SECONDS);
  }
}
