import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { findOrganizationsWithDaysToClose } from '@/domains/app/sub-domains/billing/day-closes/day-close-auto-close.repository.js';
import { enqueueDayCloseAutoClose } from '@/domains/app/sub-domains/billing/day-closes/queues/day-close-auto-close.queue.js';

/**
 * The hourly sweep of the day auto-close (WC-39, B26): finds the organizations with a past day to
 * close and adds one auto-close job each.
 *
 * @remarks
 * - **Algorithm:** one short read under the global retention cleanup context
 *   ({@link findOrganizationsWithDaysToClose}, one batch); the context closes, then each
 *   organization's job is added (deduplicated per organization — one waiting job at most).
 * - **Failure modes:** a failed add is logged and skipped — the next hourly sweep finds the
 *   organization again, its days still open; a read error propagates so BullMQ retries.
 * - **Side effects:** jobs on `day-close-auto-close`.
 */
export async function runDayCloseAutoCloseSweepJob(): Promise<{
  enqueuedCount: number;
  failedCount: number;
}> {
  const organizationPublicIds = await runGlobalRetentionWorkerJob((databaseHandle) =>
    findOrganizationsWithDaysToClose(databaseHandle),
  );
  let enqueuedCount = 0;
  let failedCount = 0;
  for (const organizationPublicId of organizationPublicIds) {
    try {
      await enqueueDayCloseAutoClose(organizationPublicId);
      enqueuedCount += 1;
    } catch (error) {
      failedCount += 1;
      logger.warn({ error, organizationPublicId }, 'day-close-auto-close.enqueue_failed');
    }
  }
  logger.info({ enqueuedCount, failedCount }, 'day-close-auto-close-sweep.completed');
  return { enqueuedCount, failedCount };
}
