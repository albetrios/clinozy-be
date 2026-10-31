/**
 * Runbook-as-code: give every existing patient photo without a thumbnail one
 * (pnpm ops:patient-image-thumbnails-backfill) — feat-patient-image-thumbnails.
 *
 * Walks the organizations holding a live photo without a thumbnail (migrated Cresence photos
 * included), one organization at a time in id order, and that organization's photos in id order;
 * with `--apply` it enqueues one thumbnail job per photo on `patient-image-thumbnail` — the worker
 * makes each thumbnail and sets `thumbnail_key`, exactly as for a new photo.
 *
 * DRY-RUN SAFE: the default never enqueues anything; it reports how many photos per organization
 * would be. Safe to re-run and resumable: a photo that has its thumbnail is no longer read, and a
 * photo already waiting keeps its one job (the job deduplicates per photo). A photo whose stored
 * file cannot be read keeps the full-size fallback and is read again on the next run.
 *
 * Needs the worker running to make the thumbnails, and DATABASE_MAINTENANCE_URL (the global read).
 * Never point it at a hosted database without the release owner's go.
 *
 * Usage:
 *   pnpm ops:patient-image-thumbnails-backfill                         # report-only (dry-run)
 *   pnpm ops:patient-image-thumbnails-backfill --apply                 # enqueue the jobs
 *   pnpm ops:patient-image-thumbnails-backfill --apply --organization org_…  # one organization
 */
import '@/shared/config/load-env-files.js';
import { closeDatabase } from '@/infrastructure/database/connection.js';
import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  findOrganizationsWithPhotosWithoutThumbnail,
  findPhotosWithoutThumbnail,
} from '@/domains/app/sub-domains/patients/patient-images/patient-image-thumbnail.repository.js';
import {
  closePatientImageThumbnailQueue,
  enqueuePatientImageThumbnailSync,
} from '@/domains/app/sub-domains/patients/patient-images/queues/patient-image-thumbnail.queue.js';
import { parseCommandLine } from '@tooling/setup/common/script.js';

/** How many organizations, and how many photos of one, one read pages through. */
const BACKFILL_PAGE_SIZE = 500;

/** The command line: `--apply` enqueues; `--organization` limits the run to one organization. */
interface BackfillOptions {
  apply: boolean;
  organizationPublicId: string | undefined;
}

/** What one run did, per organization and in total. */
export interface BackfillTotals {
  organizationCount: number;
  photoCount: number;
  enqueuedCount: number;
  failedCount: number;
}

function parseOptions(): BackfillOptions {
  const { values } = parseCommandLine({
    args: process.argv.slice(2),
    options: { apply: { type: 'boolean' }, organization: { type: 'string' } },
  });
  return {
    apply: values.apply === true,
    organizationPublicId: typeof values.organization === 'string' ? values.organization : undefined,
  };
}

/**
 * Enqueues (or, in a dry run, counts) a thumbnail job for every live photo without one,
 * organization by organization.
 *
 * @remarks
 * - **Algorithm:** keyset pages of organizations, then of each organization's photos, each read in
 *   a short global retention cleanup context; the adds run after the context closes.
 * - **Failure modes:** a failed add is logged and counted (the next run adds it); a read error
 *   propagates and stops the run — re-run it, the done photos are skipped.
 * - **Side effects:** jobs on `patient-image-thumbnail` with `apply`; logs.
 */
export async function backfillPatientImageThumbnails(
  options: BackfillOptions,
): Promise<BackfillTotals> {
  const totals: BackfillTotals = {
    organizationCount: 0,
    photoCount: 0,
    enqueuedCount: 0,
    failedCount: 0,
  };
  let organizationAfterId = 0;
  for (;;) {
    const organizations = await runGlobalRetentionWorkerJob((databaseHandle) =>
      findOrganizationsWithPhotosWithoutThumbnail(databaseHandle, {
        afterId: organizationAfterId,
        limit: BACKFILL_PAGE_SIZE,
      }),
    );
    for (const organization of organizations) {
      if (options.organizationPublicId && organization.publicId !== options.organizationPublicId) {
        continue;
      }
      totals.organizationCount += 1;
      let photoCount = 0;
      let photoAfterId = 0;
      for (;;) {
        const photos = await runGlobalRetentionWorkerJob((databaseHandle) =>
          findPhotosWithoutThumbnail(databaseHandle, {
            organizationId: organization.id,
            afterId: photoAfterId,
            limit: BACKFILL_PAGE_SIZE,
          }),
        );
        for (const photo of photos) {
          photoCount += 1;
          if (!options.apply) continue;
          try {
            await enqueuePatientImageThumbnailSync({
              organizationPublicId: organization.publicId,
              patientImagePublicId: photo.publicId,
            });
            totals.enqueuedCount += 1;
          } catch (error) {
            totals.failedCount += 1;
            logger.warn(
              { error, patientImagePublicId: photo.publicId },
              'patient-image-thumbnails-backfill.enqueue_failed',
            );
          }
        }
        if (photos.length < BACKFILL_PAGE_SIZE) break;
        photoAfterId = photos[photos.length - 1]?.id ?? photoAfterId;
      }
      totals.photoCount += photoCount;
      logger.info(
        { organizationPublicId: organization.publicId, photoCount, apply: options.apply },
        'patient-image-thumbnails-backfill.organization',
      );
    }
    if (organizations.length < BACKFILL_PAGE_SIZE) break;
    organizationAfterId = organizations[organizations.length - 1]?.id ?? organizationAfterId;
  }
  return totals;
}

async function main(): Promise<void> {
  const options = parseOptions();
  try {
    const totals = await backfillPatientImageThumbnails(options);
    logger.info(
      { apply: options.apply, ...totals },
      options.apply
        ? 'patient-image-thumbnails-backfill.complete'
        : 'patient-image-thumbnails-backfill.dry-run',
    );
  } finally {
    await closePatientImageThumbnailQueue();
    await closeDatabase();
  }
}

main().catch((error) => {
  logger.error({ error }, 'patient-image-thumbnails-backfill.failed');
  process.exitCode = 1;
});
