import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommitDispatchTask } from '@/infrastructure/queue/commit-dispatch/commit-dispatch.types.js';

const {
  dispatchOutboxEmailMock,
  enqueueNotificationMock,
  deleteNotificationByPublicIdMock,
  enqueueUserDataExportMock,
  markExportEnqueueFailedMock,
  invalidateUnreadCountMock,
  appContextScopes,
} = vi.hoisted(() => ({
  dispatchOutboxEmailMock: vi.fn().mockResolvedValue(undefined),
  enqueueNotificationMock: vi.fn().mockResolvedValue(undefined),
  deleteNotificationByPublicIdMock: vi.fn().mockResolvedValue(undefined),
  enqueueUserDataExportMock: vi.fn().mockResolvedValue(undefined),
  markExportEnqueueFailedMock: vi.fn().mockResolvedValue(true),
  invalidateUnreadCountMock: vi.fn().mockResolvedValue(undefined),
  appContextScopes: [] as unknown[],
}));

// The clean-ups run inside the recipient's / owner's own scope — passthrough so no Postgres is
// needed, recording the scope each one asked for.
vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    withAppDatabaseContext: vi.fn(
      async (scope: unknown, callback: (handle: unknown) => Promise<unknown>) => {
        appContextScopes.push(scope);
        return callback({});
      },
    ),
  };
});

vi.mock('@/infrastructure/mail/queues/mail.queue.js', () => ({
  dispatchOutboxEmail: (...arguments_: unknown[]) => dispatchOutboxEmailMock(...arguments_),
}));

vi.mock('@/domains/notify/sub-domains/notification/queues/notification.queue.js', () => ({
  enqueueNotification: (...arguments_: unknown[]) => enqueueNotificationMock(...arguments_),
}));

vi.mock('@/domains/notify/sub-domains/notification/notification.repository.js', () => ({
  createWorkerNotificationRepository: () => ({
    deleteByPublicId: deleteNotificationByPublicIdMock,
  }),
}));

vi.mock('@/domains/notify/sub-domains/notification/notification-unread-count.cache.js', () => ({
  invalidateCachedUnreadNotificationCount: (...arguments_: unknown[]) =>
    invalidateUnreadCountMock(...arguments_),
}));

vi.mock('@/domains/user/sub-domains/user-data-export/queues/user-data-export.queue.js', () => ({
  enqueueUserDataExport: (...arguments_: unknown[]) => enqueueUserDataExportMock(...arguments_),
}));

vi.mock('@/domains/user/sub-domains/user-data-export/user-data-export.repository.js', () => ({
  createWorkerUserDataExportRepository: () => ({ markEnqueueFailed: markExportEnqueueFailedMock }),
}));

const MAIL_OUTBOX_TOKEN = '6b1d2e8f-3c4a-4b5d-8e9f-0a1b2c3d4e5f';
const NOTIFICATION_PUBLIC_ID = 'ntf_9z3rura5kqvcv8zggriym';
const USER_PUBLIC_ID = 'usr_0y8vf3ktxqnhcm1ze21ab';
const EXPORT_PUBLIC_ID = 'exp_0y8vf3ktxqnhcm1ze21ab';

describe('executeCommitDispatchTask', () => {
  beforeEach(() => {
    dispatchOutboxEmailMock.mockClear();
    enqueueNotificationMock.mockReset();
    enqueueNotificationMock.mockResolvedValue(undefined);
    deleteNotificationByPublicIdMock.mockClear();
    enqueueUserDataExportMock.mockReset();
    enqueueUserDataExportMock.mockResolvedValue(undefined);
    markExportEnqueueFailedMock.mockClear();
    invalidateUnreadCountMock.mockClear();
    appContextScopes.length = 0;
  });

  async function execute(task: CommitDispatchTask): Promise<void> {
    const { executeCommitDispatchTask } = await import(
      '@/infrastructure/queue/commit-dispatch/commit-dispatch.executor.js'
    );
    await executeCommitDispatchTask(task);
  }

  it('dispatches mail outbox jobs by the row token', async () => {
    await execute({ type: 'mail_outbox', mailOutboxToken: MAIL_OUTBOX_TOKEN, requestId: 'req-1' });
    expect(dispatchOutboxEmailMock).toHaveBeenCalledWith(MAIL_OUTBOX_TOKEN, { requestId: 'req-1' });
  });

  it('enqueues a notification with its public ids only', async () => {
    await execute({
      type: 'notification',
      notificationPublicId: NOTIFICATION_PUBLIC_ID,
      organizationPublicId: 'org_public',
      userPublicId: USER_PUBLIC_ID,
    });

    expect(enqueueNotificationMock).toHaveBeenCalledWith({
      notificationPublicId: NOTIFICATION_PUBLIC_ID,
      organizationPublicId: 'org_public',
      userPublicId: USER_PUBLIC_ID,
    });
    expect(deleteNotificationByPublicIdMock).not.toHaveBeenCalled();
    expect(invalidateUnreadCountMock).not.toHaveBeenCalled();
  });

  it("deletes the orphan notification by public id under its recipient's scope when the enqueue fails", async () => {
    // The system-table maintenance scope this used matched no notification RLS policy, so on the
    // application role the delete removed nothing and the never-dispatched row stayed visible.
    enqueueNotificationMock.mockRejectedValueOnce(new Error('redis unavailable'));

    await execute({
      type: 'notification',
      notificationPublicId: NOTIFICATION_PUBLIC_ID,
      organizationPublicId: null,
      userPublicId: USER_PUBLIC_ID,
    });

    expect(appContextScopes).toEqual([expect.objectContaining({ userPublicId: USER_PUBLIC_ID })]);
    expect(deleteNotificationByPublicIdMock).toHaveBeenCalledWith(NOTIFICATION_PUBLIC_ID);
    // The recipient is known, so the badge cannot keep counting the removed row.
    expect(invalidateUnreadCountMock).toHaveBeenCalledWith(USER_PUBLIC_ID);
  });

  it('enqueues a data export without the owner bigserial', async () => {
    await execute({
      type: 'user_data_export',
      exportPublicId: EXPORT_PUBLIC_ID,
      userPublicId: USER_PUBLIC_ID,
    });

    expect(enqueueUserDataExportMock).toHaveBeenCalledWith({
      exportPublicId: EXPORT_PUBLIC_ID,
      userPublicId: USER_PUBLIC_ID,
    });
    expect(markExportEnqueueFailedMock).not.toHaveBeenCalled();
  });

  it("fails the still-pending export under its owner's scope when the enqueue fails", async () => {
    enqueueUserDataExportMock.mockRejectedValueOnce(new Error('redis unavailable'));

    await execute({
      type: 'user_data_export',
      exportPublicId: EXPORT_PUBLIC_ID,
      userPublicId: USER_PUBLIC_ID,
    });

    expect(appContextScopes).toEqual([expect.objectContaining({ userPublicId: USER_PUBLIC_ID })]);
    expect(markExportEnqueueFailedMock).toHaveBeenCalledWith(EXPORT_PUBLIC_ID);
  });
});
