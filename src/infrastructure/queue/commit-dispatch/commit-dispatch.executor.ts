import { dispatchOutboxEmail } from '@/infrastructure/mail/queues/mail.queue.js';
import { createWorkerNotificationRepository } from '@/domains/notify/sub-domains/notification/notification.repository.js';
import { invalidateCachedUnreadNotificationCount } from '@/domains/notify/sub-domains/notification/notification-unread-count.cache.js';
import { enqueueNotification } from '@/domains/notify/sub-domains/notification/queues/notification.queue.js';
import { enqueueUserDataExport } from '@/domains/user/sub-domains/user-data-export/queues/user-data-export.queue.js';
import { createWorkerUserDataExportRepository } from '@/domains/user/sub-domains/user-data-export/user-data-export.repository.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import type { CommitDispatchTask } from '@/infrastructure/queue/commit-dispatch/commit-dispatch.types.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';

/**
 * Executes one durable post-commit task.
 *
 * @remarks
 * - **Algorithm:** switch on `task.type` and delegate to the matching enqueue helper.
 * - **Failure modes:** notification enqueue failure deletes the orphan row (and invalidates the
 *   recipient's cached unread count); export enqueue failure marks the still-pending export
 *   failed. Both clean-ups run under the recipient's / owner's own scope, by public id — the
 *   row's RLS policy authorises exactly that row.
 * - **Side effects:** may enqueue BullMQ jobs or mutate Postgres rows on failure cleanup.
 * - **Notes:** idempotent — safe for recovery sweeper replay (notification and export jobs are
 *   keyed by their public ids, so a replayed enqueue is dropped while the first job is retained).
 */
export async function executeCommitDispatchTask(task: CommitDispatchTask): Promise<void> {
  switch (task.type) {
    case 'mail_outbox':
      if (task.requestId !== undefined) {
        await dispatchOutboxEmail(task.mailOutboxToken, { requestId: task.requestId });
      } else {
        await dispatchOutboxEmail(task.mailOutboxToken);
      }
      return;
    case 'notification':
      try {
        await enqueueNotification({
          notificationPublicId: task.notificationPublicId,
          organizationPublicId: task.organizationPublicId,
          userPublicId: task.userPublicId,
        });
      } catch (error) {
        logger.error(
          { error, notificationPublicId: task.notificationPublicId },
          'commit-dispatch.notification.enqueue_failed',
        );
        // Delete the orphan under its recipient's scope: `notifications_owner_access` reaches the
        // row whether or not it has an organization. The system-table maintenance scope this ran
        // under before matched no notification policy, so on the RLS-subject application role the
        // delete removed nothing and the never-dispatched row stayed in the inbox.
        await withAppDatabaseContext(
          PRINCIPAL_SCOPE.VERIFIED({ userPublicId: task.userPublicId }),
          (databaseHandle) =>
            createWorkerNotificationRepository(databaseHandle).deleteByPublicId(
              task.notificationPublicId,
            ),
        );
        // A read between the insert and this delete may have cached a count that includes it.
        await invalidateCachedUnreadNotificationCount(task.userPublicId);
      }
      return;
    case 'user_data_export':
      try {
        await enqueueUserDataExport({
          exportPublicId: task.exportPublicId,
          userPublicId: task.userPublicId,
        });
      } catch (error) {
        logger.error(
          { error, exportPublicId: task.exportPublicId, userPublicId: task.userPublicId },
          'commit-dispatch.user_data_export.enqueue_failed',
        );
        await withAppDatabaseContext(
          PRINCIPAL_SCOPE.VERIFIED({ userPublicId: task.userPublicId }),
          (databaseHandle) =>
            createWorkerUserDataExportRepository(databaseHandle).markEnqueueFailed(
              task.exportPublicId,
            ),
        );
      }
      return;
    default: {
      const exhaustiveCheck: never = task;
      throw new Error(`Unknown commit dispatch task: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}
