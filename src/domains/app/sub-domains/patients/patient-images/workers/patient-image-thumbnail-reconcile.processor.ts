import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { findPatientImagesOutOfThumbnailSync } from '@/domains/app/sub-domains/patients/patient-images/patient-image-thumbnail.repository.js';
import { enqueuePatientImageThumbnailSync } from '@/domains/app/sub-domains/patients/patient-images/queues/patient-image-thumbnail.queue.js';
import {
  PATIENT_IMAGE_THUMBNAIL_SWEEP_BATCH,
  PATIENT_IMAGE_THUMBNAIL_SWEEP_GRACE_MS,
  PATIENT_IMAGE_THUMBNAIL_SWEEP_MAX_PER_RUN,
  PATIENT_IMAGE_THUMBNAIL_SWEEP_WINDOW_MS,
} from './patient-image-thumbnail.constants.js';

/**
 * The thumbnail sweep (lost enqueues): re-adds a thumbnail job for every photo whose thumbnail
 * does not match its row — live photos created 10 minutes to 7 days ago without one, deleted
 * photos still holding one.
 *
 * @remarks
 * - **Algorithm:** pages through the photos in id order, one short read per batch under the
 *   global retention cleanup context ({@link findPatientImagesOutOfThumbnailSync}); after each
 *   read the context closes and each photo's job is added (deduplicated per photo). Stops after
 *   {@link PATIENT_IMAGE_THUMBNAIL_SWEEP_MAX_PER_RUN} photos — the rest next run. Older live
 *   photos are the backfill's; an unreadable photo stops being retried when it leaves the window.
 * - **Failure modes:** a failed add is logged and counted — the next run adds it again; a read
 *   error propagates so BullMQ retries.
 * - **Side effects:** jobs on `patient-image-thumbnail`.
 */
export async function runPatientImageThumbnailReconcileJob(
  now: Date = new Date(),
): Promise<{ enqueuedCount: number; failedCount: number }> {
  const createdBefore = new Date(now.getTime() - PATIENT_IMAGE_THUMBNAIL_SWEEP_GRACE_MS);
  const createdAfter = new Date(now.getTime() - PATIENT_IMAGE_THUMBNAIL_SWEEP_WINDOW_MS);
  let enqueuedCount = 0;
  let failedCount = 0;
  let afterId = 0;
  while (enqueuedCount + failedCount < PATIENT_IMAGE_THUMBNAIL_SWEEP_MAX_PER_RUN) {
    const batch = await runGlobalRetentionWorkerJob((databaseHandle) =>
      findPatientImagesOutOfThumbnailSync(databaseHandle, {
        afterId,
        createdAfter,
        createdBefore,
        limit: PATIENT_IMAGE_THUMBNAIL_SWEEP_BATCH,
      }),
    );
    for (const photo of batch) {
      try {
        await enqueuePatientImageThumbnailSync({
          organizationPublicId: photo.organizationPublicId,
          patientImagePublicId: photo.publicId,
        });
        enqueuedCount += 1;
      } catch (error) {
        failedCount += 1;
        logger.warn(
          { error, patientImagePublicId: photo.publicId },
          'patient-image-thumbnail.enqueue_failed',
        );
      }
    }
    if (batch.length < PATIENT_IMAGE_THUMBNAIL_SWEEP_BATCH) break;
    afterId = batch[batch.length - 1]?.id ?? afterId;
  }
  logger.info({ enqueuedCount, failedCount }, 'patient-image-thumbnail-reconcile.completed');
  return { enqueuedCount, failedCount };
}
