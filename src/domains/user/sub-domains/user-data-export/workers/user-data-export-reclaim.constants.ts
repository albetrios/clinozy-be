import { MILLISECONDS_PER_MINUTE } from '@/shared/constants/ttl.constants.js';

/**
 * The repeatable job on the `user-data-export` queue that re-enqueues exports whose job never
 * arrived — run by the export worker itself (routed on `job.name`), so it needs no worker or
 * connection budget of its own.
 */
export const USER_DATA_EXPORT_RECLAIM_JOB_NAME = 'reclaim-pending-user-data-exports';

/** An export still `pending` this long after it was requested lost its enqueue. */
export const USER_DATA_EXPORT_RECLAIM_STALE_AFTER_MS = 5 * MILLISECONDS_PER_MINUTE;

/** Exports re-enqueued per pass, oldest first. */
export const USER_DATA_EXPORT_RECLAIM_BATCH_SIZE = 100;
