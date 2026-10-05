import type { UserDataExportService } from '@/domains/user/sub-domains/user-data-export/user-data-export.service.js';
import type { UserDataExportJobData } from '@/domains/user/sub-domains/user-data-export/queues/user-data-export.job.schema.js';
import { UserDataExportCancelledError } from '@/domains/user/sub-domains/user-data-export/user-data-export.types.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { gzipBufferAsync } from '@/shared/utils/infrastructure/gzip.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/**
 * Execute one `user-data-export` job in short user-scoped DB phases so gzip and S3 upload
 * never pin a Postgres connection.
 *
 * @remarks
 * - **Algorithm:** in the owner's scope, read the owner's internal id (the job carries public ids
 *   only), check cancellation, mark `processing`, re-check cancellation → build the GDPR payload
 *   and gzip outside any transaction → resolve the S3 key in a fresh user context → upload →
 *   mark `completed` in another short context. Each cancellation check covers the user being
 *   soft-deleted or the export row being purged by offboarding; an owner that no longer exists
 *   at all cancels the job too.
 * - **Failure modes:** {@link UserDataExportCancelledError} short-circuits to a no-op (no retry,
 *   no failure status). All other errors are logged, mark the row `failed` with `error_code`
 *   `export_failed`, and re-throw so BullMQ applies the queue's retry/backoff and DLQ policy.
 * - **Side effects:** writes `auth.user_data_exports` status, uploads a gzip JSON object to the
 *   GDPR S3 prefix, and emits structured logs for observability.
 * - **Notes:** cross-domain reads delegate to each owning domain's service (see dependency rules).
 */
export async function runUserDataExportJob(
  jobData: UserDataExportJobData,
  userDataExportService: UserDataExportService,
): Promise<void> {
  const { exportPublicId, userPublicId } = jobData;
  const ownerScope = PRINCIPAL_SCOPE.JOB({ userPublicId: userPublicId });

  try {
    const userInternalId = await withAppDatabaseContext(ownerScope, async (databaseHandle) => {
      const ownerInternalId =
        await userDataExportService.resolveExportOwnerInternalId(userPublicId);
      if (ownerInternalId === null) {
        logger.info({ exportPublicId, userPublicId }, 'user-data-export.worker.cancelled');
        return null;
      }
      const isCancelled = () =>
        userDataExportService.isExportJobCancelled({
          exportPublicId,
          userInternalId: ownerInternalId,
          userPublicId,
          databaseHandle,
        });
      if (await isCancelled()) {
        logger.info({ exportPublicId, userPublicId }, 'user-data-export.worker.cancelled');
        return null;
      }

      await userDataExportService.markProcessing(
        exportPublicId,
        ownerInternalId,
        databaseHandle,
        userPublicId,
      );

      if (await isCancelled()) {
        logger.info({ exportPublicId, userPublicId }, 'user-data-export.worker.cancelled');
        return null;
      }

      return ownerInternalId;
    });

    if (userInternalId === null) {
      return;
    }

    const payload = await userDataExportService.buildExportPayload(userPublicId);
    const jsonBody = JSON.stringify(payload);
    const compressedBody = await gzipBufferAsync(Buffer.from(jsonBody, 'utf8'));

    await userDataExportService.completeExportJob({
      exportPublicId,
      userInternalId,
      userPublicId,
      body: compressedBody,
    });

    logger.info({ exportPublicId, userPublicId }, 'user-data-export.worker.completed');
  } catch (error) {
    if (error instanceof UserDataExportCancelledError) {
      logger.info({ exportPublicId, userPublicId }, 'user-data-export.worker.cancelled');
      return;
    }
    logger.error({ error, exportPublicId, userPublicId }, 'user-data-export.worker.failed');
    await withAppDatabaseContext(ownerScope, async (databaseHandle) => {
      const ownerInternalId =
        await userDataExportService.resolveExportOwnerInternalId(userPublicId);
      if (ownerInternalId === null) return;
      await userDataExportService.failExportJob(
        exportPublicId,
        ownerInternalId,
        'export_failed',
        databaseHandle,
      );
    });
    throw error;
  }
}
