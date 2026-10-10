import { enqueueUserDataExport } from '@/domains/user/sub-domains/user-data-export/queues/user-data-export.queue.js';
import { findStalePendingExports } from '@/domains/user/sub-domains/user-data-export/user-data-export.repository.js';
import {
  USER_DATA_EXPORT_RECLAIM_BATCH_SIZE,
  USER_DATA_EXPORT_RECLAIM_STALE_AFTER_MS,
} from '@/domains/user/sub-domains/user-data-export/workers/user-data-export-reclaim.constants.js';
import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/**
 * What one reclaim pass did.
 *
 * @remarks
 * Logged as `user-data-export-reclaim.completed`; `scannedCount` at the batch size means the next
 * pass has more to do.
 */
export type UserDataExportReclaimJobResult = {
  scannedCount: number;
  addedCount: number;
};

/**
 * Re-enqueues data exports still `pending` past {@link USER_DATA_EXPORT_RECLAIM_STALE_AFTER_MS} —
 * the lost-enqueue sweep of the export queue.
 *
 * @remarks
 * - **Algorithm:** one read across users under the retention maintenance context, then, outside it,
 *   one add per export. The job id is the export's public id, so an add is a no-op while its job
 *   exists (waiting, delayed, or retained after it ran).
 * - **Why:** the export job is enqueued after the request commits, and the add fails fast while Redis
 *   is unreachable; the row then stayed `pending` with no job, and every new request for an export
 *   returned that row.
 * - **Failure modes:** a database error propagates (the job retries); each add is best-effort, logged.
 * - **Side effects:** export jobs on the `user-data-export` queue.
 */
export async function runUserDataExportReclaimJob(
  options: { now?: Date } = {},
): Promise<UserDataExportReclaimJobResult> {
  const createdBefore = new Date(
    (options.now ?? new Date()).getTime() - USER_DATA_EXPORT_RECLAIM_STALE_AFTER_MS,
  );
  const staleExports = await runGlobalRetentionWorkerJob((databaseHandle) =>
    findStalePendingExports(databaseHandle, {
      createdBefore,
      limit: USER_DATA_EXPORT_RECLAIM_BATCH_SIZE,
    }),
  );

  // Added together, each with its own try/catch: one failed add must not stop the rest.
  const addOutcomes = await Promise.all(
    staleExports.map(async (staleExport) => {
      try {
        await enqueueUserDataExport({
          exportPublicId: staleExport.exportPublicId,
          userPublicId: staleExport.userPublicId,
        });
        return true;
      } catch (error) {
        logger.warn(
          { error, exportPublicId: staleExport.exportPublicId },
          'user-data-export-reclaim.enqueue.failed',
        );
        return false;
      }
    }),
  );
  const result = {
    scannedCount: staleExports.length,
    addedCount: addOutcomes.filter(Boolean).length,
  };
  logger.info(result, 'user-data-export-reclaim.completed');
  return result;
}
