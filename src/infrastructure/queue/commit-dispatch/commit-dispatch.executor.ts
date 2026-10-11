import { dispatchOutboxEmail } from '@/infrastructure/mail/queues/mail.queue.js';
import {
  discardUndispatchedNotification,
  enqueueNotification,
} from '@/domains/notify/sub-domains/notification/queues/notification.queue.js';
import { enqueueUserDataExport } from '@/domains/user/sub-domains/user-data-export/queues/user-data-export.queue.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import type { CommitDispatchTask } from '@/infrastructure/queue/commit-dispatch/commit-dispatch.types.js';

/**
 * Executes one durable post-commit task.
 *
 * @remarks
 * - **Algorithm:** switch on `task.type` and delegate to the matching enqueue helper.
 * - **Failure modes:** a notification whose enqueue fails is deleted by its own domain
 *   ({@link discardUndispatchedNotification}); a data export whose enqueue fails stays `pending` for
 *   the `reclaim-pending-user-data-exports` sweep — an enqueue error never fails a row-backed job.
 * - **Side effects:** may enqueue BullMQ jobs or mutate Postgres rows on failure cleanup.
 * - **Notes:** idempotent — safe for recovery sweeper replay (notification and export jobs are
 *   keyed by their public ids, so a replayed enqueue is dropped while the first job is retained).
 */
export async function executeCommitDispatchTask(task: CommitDispatchTask): Promise<void> {
  switch (task.type) {
    case 'mail_outbox':
      if (task.requestId !== undefined) {
        await dispatchOutboxEmail({
          mailOutboxToken: task.mailOutboxToken,
          options: { requestId: task.requestId },
        });
      } else {
        await dispatchOutboxEmail({ mailOutboxToken: task.mailOutboxToken });
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
        await discardUndispatchedNotification({
          notificationPublicId: task.notificationPublicId,
          userPublicId: task.userPublicId,
        });
      }
      return;
    case 'user_data_export':
      try {
        await enqueueUserDataExport({
          exportPublicId: task.exportPublicId,
          userPublicId: task.userPublicId,
        });
      } catch (error) {
        // The row stays `pending`: an enqueue error never fails a row-backed job — the
        // `reclaim-pending-user-data-exports` sweep re-enqueues it once Redis takes writes again.
        logger.error(
          { error, exportPublicId: task.exportPublicId, userPublicId: task.userPublicId },
          'commit-dispatch.user_data_export.enqueue_failed',
        );
      }
      return;
    default: {
      const exhaustiveCheck: never = task;
      throw new Error(`Unknown commit dispatch task: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}
