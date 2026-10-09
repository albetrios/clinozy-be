import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { findOrganizationsWithStaleIdeas } from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.repository.js';
import { enqueuePatientIdeas } from '@/domains/app/sub-domains/patients/patient-ideas/queues/patient-ideas.queue.js';
import { PATIENT_IDEAS_SWEEP_BATCH } from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.constants.js';

/**
 * The five-minute sweep of the AI ideas (WC-47, D80): adds one ideas job per organization with a
 * live patient file marked stale.
 *
 * @remarks
 * - **Algorithm:** pages through the organizations in id order, one short read per batch under the
 *   global retention cleanup context ({@link findOrganizationsWithStaleIdeas}); after each read the
 *   context closes and each organization's job is added (deduplicated per organization — one
 *   waiting job at most).
 * - **Failure modes:** a failed add is logged and skipped — the marks stay and the next sweep adds
 *   the organization again (the lost-enqueue sweep is this sweep); a read error propagates so
 *   BullMQ retries.
 * - **Side effects:** jobs on `patient-ideas`.
 */
export async function runPatientIdeasSweepJob(): Promise<{
  enqueuedCount: number;
  failedCount: number;
}> {
  let enqueuedCount = 0;
  let failedCount = 0;
  let afterId = 0;
  for (;;) {
    const batch = await runGlobalRetentionWorkerJob((databaseHandle) =>
      findOrganizationsWithStaleIdeas(databaseHandle, afterId),
    );
    for (const organization of batch) {
      try {
        await enqueuePatientIdeas(organization.publicId);
        enqueuedCount += 1;
      } catch (error) {
        failedCount += 1;
        logger.warn(
          { error, organizationPublicId: organization.publicId },
          'patient-ideas.enqueue_failed',
        );
      }
    }
    if (batch.length < PATIENT_IDEAS_SWEEP_BATCH) break;
    afterId = batch[batch.length - 1]?.id ?? afterId;
  }
  logger.info({ enqueuedCount, failedCount }, 'patient-ideas-sweep.completed');
  return { enqueuedCount, failedCount };
}
