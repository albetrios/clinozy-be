import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enterOnCommitScope, eventBus } from '@/core/events/event-bus.js';
import { createNotificationDispatch } from '@/domains/notify/sub-domains/notification/notification-dispatch.service.js';
import type { NotificationRepository } from '@/domains/notify/sub-domains/notification/notification.repository.js';

const { enqueueNotificationMock } = vi.hoisted(() => ({
  enqueueNotificationMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/domains/notify/sub-domains/notification/queues/notification.queue.js', () => ({
  enqueueNotification: (...arguments_: unknown[]) => enqueueNotificationMock(...arguments_),
}));

const NOTIFICATION_PUBLIC_ID = 'ntf_9z3rura5kqvcv8zggriym';
const RECIPIENT_PUBLIC_ID = 'usr_recipient00000000001';

describe('NotificationDispatch', () => {
  const notificationRepository = {
    create: vi.fn().mockResolvedValue({ publicId: NOTIFICATION_PUBLIC_ID }),
    findOrganizationPublicIdByOrganizationId: vi.fn().mockResolvedValue('org_public'),
    resolveUserPublicIdsByInternalIds: vi.fn(),
  } as unknown as NotificationRepository;

  const dispatch = createNotificationDispatch(notificationRepository);

  beforeEach(() => {
    enqueueNotificationMock.mockClear();
    vi.mocked(notificationRepository.create).mockClear();
    vi.mocked(notificationRepository.findOrganizationPublicIdByOrganizationId).mockClear();
    vi.mocked(notificationRepository.resolveUserPublicIdsByInternalIds).mockReset();
    vi.mocked(notificationRepository.resolveUserPublicIdsByInternalIds).mockResolvedValue([
      RECIPIENT_PUBLIC_ID,
    ]);
  });

  it('defers enqueueNotification until flushOnCommit', async () => {
    enterOnCommitScope();
    await dispatch.createAndDispatchNotification({
      input: {
        user_id: 1,
        organization_id: 2,
        type: 'billing',
        title: 'Test',
        message: 'Body',
      },
    });

    expect(enqueueNotificationMock).not.toHaveBeenCalled();

    await eventBus.flushOnCommit();
    expect(enqueueNotificationMock).toHaveBeenCalledOnce();
    // Public ids only travel with the post-commit task: the job outlives an id restart.
    expect(enqueueNotificationMock).toHaveBeenCalledWith({
      notificationPublicId: NOTIFICATION_PUBLIC_ID,
      organizationPublicId: 'org_public',
      userPublicId: RECIPIENT_PUBLIC_ID,
    });
    expect(notificationRepository.resolveUserPublicIdsByInternalIds).toHaveBeenCalledWith([1]);
  });

  it('resolves organization public id before inserting the notification row', async () => {
    const callOrder: string[] = [];
    vi.mocked(
      notificationRepository.findOrganizationPublicIdByOrganizationId,
    ).mockImplementationOnce(async () => {
      callOrder.push('lookup');
      return 'org_public';
    });
    vi.mocked(notificationRepository.resolveUserPublicIdsByInternalIds).mockImplementationOnce(
      async () => {
        callOrder.push('recipient');
        return [RECIPIENT_PUBLIC_ID];
      },
    );
    vi.mocked(notificationRepository.create).mockImplementationOnce(async () => {
      callOrder.push('create');
      return { publicId: NOTIFICATION_PUBLIC_ID };
    });

    enterOnCommitScope();
    await dispatch.createAndDispatchNotification({
      input: {
        user_id: 1,
        organization_id: 2,
        type: 'billing',
        title: 'Test',
        message: 'Body',
      },
    });

    expect(callOrder).toEqual(['lookup', 'recipient', 'create']);
  });

  it('skips organization lookup and passes null public id for user-only notifications', async () => {
    enterOnCommitScope();
    await dispatch.createAndDispatchNotification({
      input: {
        user_id: 1,
        type: 'system',
        title: 'Test',
        message: 'Body',
      },
    });

    expect(notificationRepository.findOrganizationPublicIdByOrganizationId).not.toHaveBeenCalled();

    await eventBus.flushOnCommit();
    expect(enqueueNotificationMock).toHaveBeenCalledWith({
      notificationPublicId: NOTIFICATION_PUBLIC_ID,
      organizationPublicId: null,
      userPublicId: RECIPIENT_PUBLIC_ID,
    });
  });

  it('does not create the notification when the recipient does not resolve', async () => {
    vi.mocked(notificationRepository.resolveUserPublicIdsByInternalIds).mockResolvedValueOnce([]);

    await expect(
      dispatch.createAndDispatchNotification({
        input: {
          user_id: 404,
          type: 'system',
          title: 'Test',
          message: 'Body',
        },
      }),
    ).rejects.toMatchObject({ statusCode: 404, messageParams: { resource: 'User' } });

    expect(notificationRepository.create).not.toHaveBeenCalled();
  });

  it('does not create the notification when organization lookup fails', async () => {
    const lookupError = new Error('organization lookup failed');
    vi.mocked(
      notificationRepository.findOrganizationPublicIdByOrganizationId,
    ).mockRejectedValueOnce(lookupError);

    await expect(
      dispatch.createAndDispatchNotification({
        input: {
          user_id: 1,
          organization_id: 2,
          type: 'billing',
          title: 'Test',
          message: 'Body',
        },
      }),
    ).rejects.toBe(lookupError);

    expect(notificationRepository.create).not.toHaveBeenCalled();
  });

  it('resolves recipient public ids through the repository batch resolver', async () => {
    // The invite-accepted handler needs public ids to key each recipient's unread-count cache,
    // and it has only internal ids. This is the seam; it lives on the dispatch because that is
    // the repository handle a cross-domain event handler is allowed to reach.
    vi.mocked(notificationRepository.resolveUserPublicIdsByInternalIds).mockResolvedValue([
      'usr_one',
      'usr_two',
    ]);
    await expect(dispatch.resolveRecipientPublicIds([11, 22])).resolves.toEqual([
      'usr_one',
      'usr_two',
    ]);
    expect(notificationRepository.resolveUserPublicIdsByInternalIds).toHaveBeenCalledWith([11, 22]);
  });

  it('the module-level resolver refuses to run before the container wired the dispatch', async () => {
    // Boot-order bug, not a runtime condition — an unconfigured singleton quietly answering []
    // would skip every cache invalidation instead of failing somewhere a human would see it.
    // Imported fresh rather than reusing the file's module instance, so this does not depend on
    // no earlier test in this file having configured the singleton.
    vi.resetModules();
    const fresh = await import(
      '@/domains/notify/sub-domains/notification/notification-dispatch.service.js'
    );

    await expect(fresh.resolveNotificationRecipientPublicIds([1])).rejects.toThrow(
      /Notification dispatch is not configured/,
    );

    vi.mocked(notificationRepository.resolveUserPublicIdsByInternalIds).mockResolvedValue([
      'usr_one',
      'usr_two',
    ]);
    fresh.configureNotificationDispatch(fresh.createNotificationDispatch(notificationRepository));
    await expect(fresh.resolveNotificationRecipientPublicIds([11, 22])).resolves.toEqual([
      'usr_one',
      'usr_two',
    ]);
  });
});
