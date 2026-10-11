import type { WorkerDatabaseHandle } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { createWorkerDayCloseAutoCloseRepository } from '@/domains/app/sub-domains/billing/day-closes/day-close-auto-close.repository.js';

/**
 * Closes one organization's past days nobody closed (WC-39, B26): each branch-day still open at
 * the end of the day after it — and each day money moved on but nobody opened — closes with the
 * counted cash taken as expected (`close_kind = auto`) and an `auto_closed` event.
 *
 * @remarks
 * - **Algorithm:** inside the organization's context (one transaction), in branch and date order:
 *   an unopened day is opened first with the branch's last counted cash, then each day is taken
 *   `FOR UPDATE`, its live payments summed and closed; a day closed or opened meanwhile is
 *   skipped. At most one job's batch of days — the next sweep picks up the rest.
 * - **Failure modes:** a database error rolls the whole job back and propagates, so BullMQ
 *   retries; running it twice closes nothing twice (only open days close). Never closes today or
 *   yesterday.
 * - **Side effects:** inserts and updates on `app.day_closes`, inserts on `app.day_close_events`.
 */
export async function runDayCloseAutoCloseJob({
  databaseHandle,
  organizationPublicId,
}: {
  databaseHandle: WorkerDatabaseHandle;
  organizationPublicId: string;
}): Promise<{ closedCount: number; openedCount: number }> {
  const repository = createWorkerDayCloseAutoCloseRepository(databaseHandle);
  const organizationId = await repository.findOrganizationId(organizationPublicId);
  if (organizationId === null) return { closedCount: 0, openedCount: 0 };
  let closedCount = 0;
  let openedCount = 0;
  for (const day of await repository.findDueDays(organizationId)) {
    let dayCloseId = day.dayCloseId;
    if (dayCloseId === null) {
      dayCloseId = await repository.openUnopenedDay({
        organizationId,
        branchId: day.branchId,
        closeDate: day.closeDate,
      });
      if (dayCloseId === null) continue;
      openedCount += 1;
    }
    if (await repository.closeAsExpected({ organizationId, dayCloseId })) closedCount += 1;
  }
  logger.info({ organizationPublicId, closedCount, openedCount }, 'day-close-auto-close.completed');
  return { closedCount, openedCount };
}
