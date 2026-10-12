import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { findOrganizationsForTaskRules } from '@/domains/app/sub-domains/tasks/task-rules.repository.js';
import { enqueueTaskRules } from '@/domains/app/sub-domains/tasks/queues/task-rules.queue.js';
import { TASK_RULES_SWEEP_BATCH } from './task-rules.constants.js';

/**
 * The five-minute sweep of the task rules (TK4): adds one task rules job per active team
 * organization.
 *
 * @remarks
 * - **Algorithm:** pages through the organizations in id order, one short read per batch under the
 *   global retention cleanup context ({@link findOrganizationsForTaskRules}); after each read the
 *   context closes and each organization's job is added (deduplicated per organization — one
 *   waiting job at most).
 * - **Failure modes:** a failed add is logged and skipped — the next sweep adds the organization
 *   again; a read error propagates so BullMQ retries.
 * - **Side effects:** jobs on `task-rules`.
 */
export async function runTaskRulesSweepJob(): Promise<{
  enqueuedCount: number;
  failedCount: number;
}> {
  let enqueuedCount = 0;
  let failedCount = 0;
  let afterId = 0;
  for (;;) {
    const batch = await runGlobalRetentionWorkerJob((databaseHandle) =>
      findOrganizationsForTaskRules(databaseHandle, afterId),
    );
    for (const organization of batch) {
      try {
        await enqueueTaskRules(organization.publicId);
        enqueuedCount += 1;
      } catch (error) {
        failedCount += 1;
        logger.warn(
          { error, organizationPublicId: organization.publicId },
          'task-rules.enqueue_failed',
        );
      }
    }
    if (batch.length < TASK_RULES_SWEEP_BATCH) break;
    afterId = batch[batch.length - 1]?.id ?? afterId;
  }
  logger.info({ enqueuedCount, failedCount }, 'task-rules-sweep.completed');
  return { enqueuedCount, failedCount };
}
