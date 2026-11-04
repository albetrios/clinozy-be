import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import type { UploadService } from '@/domains/upload/upload.service.js';
import type { PatientImageThumbnailSkipReason } from '@/domains/app/sub-domains/patients/patient-images/patient-images.constants.js';
import { createWorkerPatientImageThumbnailRepository } from '@/domains/app/sub-domains/patients/patient-images/patient-image-thumbnail.repository.js';

/**
 * What the thumbnail job needs of the upload domain — the common thumbnail capability.
 *
 * @remarks
 * - **Notes:** the worker registry passes the upload container's `UploadService`; tests pass a
 *   fake. Neither method touches the database, so the job calls them between its contexts.
 */
export type PatientImageThumbnailStorage = Pick<
  UploadService,
  'createThumbnail' | 'deleteThumbnail'
>;

/**
 * What one thumbnail job did (its return value, kept on the completed job).
 *
 * @remarks
 * - **Notes:** `skipped` reasons — `row_gone` (purged), `in_sync` (nothing to do), and the upload
 *   domain's `not_opted_in` / `source_missing` / `source_unusable` (the photo keeps its full-size
 *   fallback).
 */
export type PatientImageThumbnailOutcome =
  | { outcome: 'created'; thumbnailKey: string }
  | { outcome: 'removed'; thumbnailKey: string }
  | {
      outcome: 'skipped';
      reason: 'row_gone' | 'in_sync' | PatientImageThumbnailSkipReason;
    };

/**
 * Brings one patient photo's thumbnail in step with its row: a live photo without one gets one, a
 * deleted photo holding one loses it (feat-patient-image-thumbnails).
 *
 * @remarks
 * - **Algorithm:** reads the row in a short organization context and closes it; then, outside
 *   any database context, asks the upload domain to make the thumbnail
 *   (`UploadService.createThumbnail`) or delete it (`deleteThumbnail`); then writes
 *   `thumbnail_key` in a second short context — a compare-and-set (set when empty, clear when it
 *   still holds the removed key). A photo restored while its thumbnail was being removed is left
 *   empty and live, and the job kept behind this one (the restore's) makes it again.
 * - **Failure modes:** a photo that is gone, already in step, outside the opted-in prefixes, or
 *   whose stored file is missing or unreadable (corrupt, over the pixel or decoded-size cap, past the time limit)
 *   is a skip (completed, warn log for the last three) — the photo keeps its full-size fallback,
 *   and for the last three the job records the reason (`thumbnail_skip_reason`, a compare-and-set)
 *   so the sweep stops re-queuing it; a later run that makes the thumbnail (a restore) clears it.
 *   A photo already marked `job_failed` (its job crashed the worker, see
 *   {@link markPatientImageThumbnailJobFailed}) is skipped without touching storage, so a job
 *   queued behind the crashed one does not crash it again.
 *   A storage or database error propagates, so BullMQ retries it (the queue pauses on an S3
 *   outage).
 * - **Side effects:** at most one GET + PUT or one DELETE on the object store; one row update.
 */
export async function syncPatientImageThumbnail({
  organizationPublicId,
  patientImagePublicId,
  storage,
}: {
  organizationPublicId: string;
  patientImagePublicId: string;
  storage: PatientImageThumbnailStorage;
}): Promise<PatientImageThumbnailOutcome> {
  const inOrganization = <TResult>(
    work: (
      repository: ReturnType<typeof createWorkerPatientImageThumbnailRepository>,
    ) => Promise<TResult>,
  ): Promise<TResult> =>
    runOrganizationScopedWorkerJob({
      job: { organizationPublicId },
      processor: (databaseHandle) =>
        work(createWorkerPatientImageThumbnailRepository(databaseHandle)),
    });

  const row = await inOrganization((repository) =>
    repository.findByPublicId({ publicId: patientImagePublicId, organizationPublicId }),
  );
  if (row === null) return { outcome: 'skipped', reason: 'row_gone' };

  if (row.deletedAt === null && row.thumbnailKey === null) {
    // A job that failed for good (a crash) is not handed the file again — not even one queued
    // behind it
    if (row.thumbnailSkipReason === 'job_failed')
      return { outcome: 'skipped', reason: 'job_failed' };
    const result = await storage.createThumbnail({ organizationPublicId, fileKey: row.fileKey });
    if (result.kind === 'skipped') {
      logger.warn(
        { organizationPublicId, patientImagePublicId, reason: result.reason },
        'patient-image-thumbnail.source_unusable',
      );
      await inOrganization((repository) =>
        repository.markThumbnailSkipped({ id: row.id, reason: result.reason }),
      );
      return { outcome: 'skipped', reason: result.reason };
    }
    await inOrganization((repository) =>
      repository.setThumbnailKey({ id: row.id, thumbnailKey: result.thumbnailKey }),
    );
    return { outcome: 'created', thumbnailKey: result.thumbnailKey };
  }

  if (row.deletedAt !== null && row.thumbnailKey !== null) {
    const thumbnailKey = row.thumbnailKey;
    await storage.deleteThumbnail({ organizationPublicId, thumbnailKey });
    await inOrganization((repository) =>
      repository.clearThumbnailKey({ id: row.id, thumbnailKey }),
    );
    return { outcome: 'removed', thumbnailKey };
  }

  return { outcome: 'skipped', reason: 'in_sync' };
}

/**
 * Records that a photo's thumbnail job failed for good (`thumbnail_skip_reason = 'job_failed'`), so
 * the sweep and the backfill stop handing it to the worker again.
 *
 * @remarks
 * - **Algorithm:** in the job's organization context, reads the photo and, when it is still live
 *   without a thumbnail, records the reason (the compare-and-set of
 *   `PatientImageThumbnailRepository.markThumbnailSkipped`). A deleted photo or one that has a
 *   thumbnail is left alone — its removal is cheap and the sweep may retry it.
 * - **Failure modes:** a database error propagates to the caller (the worker's `failed` listener
 *   logs it); a photo that is gone answers `false`.
 * - **Side effects:** at most one row update; a warn log `patient-image-thumbnail.job_failed`.
 * - **Notes:** the worker calls it from BullMQ's `failed` event on a final failure — a job that
 *   stalled past `maxStalledCount` (BullMQ fails it with "job stalled more than allowable limit"
 *   the next time a worker takes it, without running it) or one that used every attempt — the case
 *   where the processor never got to record anything, an out-of-memory kill mid-decode included.
 */
export async function markPatientImageThumbnailJobFailed({
  organizationPublicId,
  patientImagePublicId,
}: {
  organizationPublicId: string;
  patientImagePublicId: string;
}): Promise<boolean> {
  const marked = await runOrganizationScopedWorkerJob({
    job: { organizationPublicId },
    processor: async (databaseHandle) => {
      const repository = createWorkerPatientImageThumbnailRepository(databaseHandle);
      const row = await repository.findByPublicId({
        publicId: patientImagePublicId,
        organizationPublicId,
      });
      if (row === null || row.deletedAt !== null || row.thumbnailKey !== null) return false;
      return repository.markThumbnailSkipped({ id: row.id, reason: 'job_failed' });
    },
  });
  if (marked) {
    logger.warn(
      { organizationPublicId, patientImagePublicId },
      'patient-image-thumbnail.job_failed',
    );
  }
  return marked;
}
