/** The sweep's job on the thumbnail queue: re-adds photos whose enqueue was lost. */
export const PATIENT_IMAGE_THUMBNAIL_RECONCILE_JOB_NAME = 'reconcile-patient-image-thumbnails';

/** How many photos one read of the sweep pages through. */
export const PATIENT_IMAGE_THUMBNAIL_SWEEP_BATCH = 200;

/** How many photos one sweep run re-adds at most — the rest next run. */
export const PATIENT_IMAGE_THUMBNAIL_SWEEP_MAX_PER_RUN = 2_000;

/** A live photo younger than this is left to its own job (it may still be running). */
export const PATIENT_IMAGE_THUMBNAIL_SWEEP_GRACE_MS = 10 * 60 * 1000;

/** A live photo older than this is the backfill's, not the sweep's (an unreadable one stops here). */
export const PATIENT_IMAGE_THUMBNAIL_SWEEP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
