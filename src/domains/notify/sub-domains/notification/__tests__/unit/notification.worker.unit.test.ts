import { beforeEach, describe, expect, it, vi, beforeAll } from 'vitest';
import { initializeI18nextForBackgroundWork } from '@/shared/middlewares/core/i18n.middleware.js';
import {
  processNotificationDispatchJob,
  processNotificationJob,
} from '@/domains/notify/sub-domains/notification/workers/notification.worker.js';
import type { NotificationRepository } from '@/domains/notify/sub-domains/notification/notification.repository.js';

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Per-kind dispatch: only global_admin routes to its spy (the dispatch must never enter it);
    // system_table_worker (the mail-outbox write) is a plain passthrough.
    withMaintenanceDatabaseContext: vi.fn(
      ({
        scope,
        callback,
      }: {
        scope: { kind: string };
        callback: (handle: unknown) => Promise<unknown>;
      }) =>
        scope.kind === 'GLOBAL_ADMIN'
          ? (globalAdminMaintenanceContextMock as unknown as (...parameters: unknown[]) => unknown)(
              callback,
            )
          : callback({}),
    ),
    // Arg-shift adapter: the organization-branch spy keeps its (organizationPublicId, callback)
    // signature so the existing implementations and assertions stay valid.
    withAppDatabaseContext: vi.fn(
      ({
        scope,
        callback,
      }: {
        scope: { organizationPublicId?: string; userPublicId?: string };
        callback: (handle: unknown) => Promise<unknown>;
      }) =>
        scope.organizationPublicId !== undefined
          ? organizationPrincipalContextMock(scope.organizationPublicId, callback)
          : userPrincipalContextMock(scope.userPublicId, callback),
    ),
  };
});

const recordOutboxEmailMock = vi.fn();
const dispatchOutboxEmailMock = vi.fn();
const isMailConfiguredMock = vi.fn();
const isNotificationEmailDispatchedMock = vi.fn();
const markNotificationEmailDispatchedMock = vi.fn();

const globalAdminMaintenanceContextMock = vi.fn();
const userPrincipalContextMock = vi.fn();
const organizationPrincipalContextMock = vi.fn();
const createWorkerNotificationRepositoryMock = vi.fn();

vi.mock('@/infrastructure/mail/queues/mail.queue.js', () => ({
  recordOutboxEmail: (...parameters: unknown[]) => recordOutboxEmailMock(...parameters),
  dispatchOutboxEmail: (...parameters: unknown[]) => dispatchOutboxEmailMock(...parameters),
}));

vi.mock(
  '@/domains/notify/sub-domains/notification/workers/notification-email-idempotency.js',
  () => ({
    isNotificationEmailDispatched: (...parameters: unknown[]) =>
      isNotificationEmailDispatchedMock(...parameters),
    markNotificationEmailDispatched: (...parameters: unknown[]) =>
      markNotificationEmailDispatchedMock(...parameters),
  }),
);

vi.mock('@/domains/notify/sub-domains/notification/notification.repository.js', () => ({
  createWorkerNotificationRepository: (...parameters: unknown[]) =>
    createWorkerNotificationRepositoryMock(...parameters),
}));

vi.mock('@/infrastructure/mail/mail.service.js', () => ({
  isMailConfigured: () => isMailConfiguredMock(),
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function createNotificationRepository(row: unknown): NotificationRepository {
  return {
    findByPublicIdForDispatch: vi.fn().mockResolvedValue(row),
  } as unknown as NotificationRepository;
}

const NOTIFICATION_PUBLIC_ID = 'ntf_9z3rura5kqvcv8zggriym';
const MAIL_OUTBOX_TOKEN = '6b1d2e8f-3c4a-4b5d-8e9f-0a1b2c3d4e5f';

function dispatch(options: {
  organizationPublicId?: string | null;
  jobContext?: { id?: string; requestId?: string };
  notificationRepository: NotificationRepository;
}) {
  return processNotificationDispatchJob({
    notificationPublicId: NOTIFICATION_PUBLIC_ID,
    organizationPublicId:
      options.organizationPublicId === undefined ? 'org_public_id' : options.organizationPublicId,
    jobContext: options.jobContext ?? { id: 'job-1' },
    notificationRepository: options.notificationRepository,
  });
}

function buildNotificationRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    publicId: NOTIFICATION_PUBLIC_ID,
    type: 'billing.invoice_ready',
    title: 'Invoice ready',
    message: 'Your invoice is ready.',
    actionUrl: 'https://app.example.com/invoices/1',
    userEmail: 'user@example.com',
    data: { channels: ['email', 'in_app'] },
    ...overrides,
  };
}

// Email copy comes from the locale files, as in the API and the worker.
beforeAll(async () => {
  await initializeI18nextForBackgroundWork();
});

describe('notification.worker', () => {
  beforeEach(() => {
    recordOutboxEmailMock.mockReset();
    dispatchOutboxEmailMock.mockReset();
    isMailConfiguredMock.mockReset();
    isNotificationEmailDispatchedMock.mockReset();
    markNotificationEmailDispatchedMock.mockReset();
    isMailConfiguredMock.mockReturnValue(true);
    recordOutboxEmailMock.mockResolvedValue(MAIL_OUTBOX_TOKEN);
    dispatchOutboxEmailMock.mockResolvedValue(undefined);
    isNotificationEmailDispatchedMock.mockResolvedValue(false);
    markNotificationEmailDispatchedMock.mockResolvedValue(undefined);
  });

  it('queues email and returns in-app channel result when both channels are requested', async () => {
    const repository = createNotificationRepository(buildNotificationRow());

    const result = await dispatch({
      organizationPublicId: 'org_public_id',
      jobContext: { id: 'job-1', requestId: 'request-1' },
      notificationRepository: repository,
    });

    expect(recordOutboxEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Invoice ready',
        tags: [{ name: 'category', value: 'notification-billing.invoice_ready' }],
      }),
    );
    // Fan-out email rides the bulk lane, behind sign-in codes and password resets.
    expect(dispatchOutboxEmailMock).toHaveBeenCalledWith({
      mailOutboxToken: MAIL_OUTBOX_TOKEN,
      options: {
        lane: 'bulk',
        requestId: 'request-1',
      },
    });
    expect(result).toEqual({
      outcome: 'dispatched',
      channels: ['email:queued', 'in_app:persisted'],
    });
  });

  it('sec-N7: sends to the joined row recipient, never a producer-supplied data.email (email-hijack guard)', async () => {
    // `data` is `Record<string, unknown>`; a domain handler that reflected request input into it
    // could smuggle an `email` field. The worker must ALWAYS use the notification row's joined
    // `auth.users.email` and ignore `data.email`, or system mail is redirected to an attacker inbox.
    const repository = createNotificationRepository(
      buildNotificationRow({
        userEmail: 'real@user.com',
        data: { channels: ['email'], email: 'attacker@evil.com' },
      }),
    );

    await dispatch({
      organizationPublicId: 'org_public_id',
      jobContext: { id: 'job-hijack', requestId: 'request-1' },
      notificationRepository: repository,
    });

    expect(recordOutboxEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'real@user.com' }),
    );
    expect(recordOutboxEmailMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: 'attacker@evil.com' }),
    );
  });

  it('does not enqueue a duplicate email when a prior run already durably dispatched (audit-#7)', async () => {
    isNotificationEmailDispatchedMock.mockResolvedValue(true);
    const repository = createNotificationRepository(buildNotificationRow());

    const result = await dispatch({
      organizationPublicId: 'org_public_id',
      jobContext: { id: 'job-retry', requestId: 'request-1' },
      notificationRepository: repository,
    });

    // Keyed by the public id: the bigserial (10) restarts after an id reset while the marker lives.
    expect(isNotificationEmailDispatchedMock).toHaveBeenCalledWith({
      notificationPublicId: NOTIFICATION_PUBLIC_ID,
      recipient: 'user@example.com',
    });
    expect(recordOutboxEmailMock).not.toHaveBeenCalled();
    expect(dispatchOutboxEmailMock).not.toHaveBeenCalled();
    expect(markNotificationEmailDispatchedMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: 'dispatched',
      channels: ['email:deduplicated', 'in_app:persisted'],
    });
  });

  it('marks dispatched AFTER persisting the outbox row, and returns email:outbox_pending when the BullMQ enqueue fails (audit-#7 / #45)', async () => {
    // Durability-first: the outbox row is written, the dedup marker is set, then the
    // (best-effort) enqueue runs. A dispatch failure after the durable row lands must
    // not throw — the mail-outbox sweeper re-enqueues stale pending rows. audit #45:
    // the outcome must report `email:outbox_pending`, not `email:queued`, so the
    // persisted-but-undelivered state is not masked as a successful send.
    dispatchOutboxEmailMock.mockRejectedValueOnce(new Error('redis down'));
    const repository = createNotificationRepository(buildNotificationRow());

    const result = await dispatch({
      organizationPublicId: 'org_public_id',
      jobContext: { id: 'job-1' },
      notificationRepository: repository,
    });

    expect(recordOutboxEmailMock).toHaveBeenCalledTimes(1);
    // The dedup marker is set ONLY after the durable insert succeeds.
    expect(markNotificationEmailDispatchedMock).toHaveBeenCalledWith({
      notificationPublicId: NOTIFICATION_PUBLIC_ID,
      recipient: 'user@example.com',
    });
    expect(recordOutboxEmailMock.mock.invocationCallOrder[0]!).toBeLessThan(
      markNotificationEmailDispatchedMock.mock.invocationCallOrder[0]!,
    );
    expect(dispatchOutboxEmailMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      outcome: 'dispatched',
      channels: ['email:outbox_pending', 'in_app:persisted'],
    });
  });

  it('rethrows and does NOT mark dispatched when the outbox INSERT itself fails so BullMQ retries (audit-#7)', async () => {
    // The recordOutboxEmail call is the durability commit; if it fails, NO outbox row
    // exists and NO marker is written, so a BullMQ retry re-inserts — the email is never
    // lost (the previous claim-before-insert model would have skipped the retry).
    recordOutboxEmailMock.mockRejectedValueOnce(new Error('postgres down'));
    const repository = createNotificationRepository(buildNotificationRow());

    await expect(
      dispatch({
        organizationPublicId: 'org_public_id',
        jobContext: { id: 'job-1' },
        notificationRepository: repository,
      }),
    ).rejects.toThrow('postgres down');

    expect(markNotificationEmailDispatchedMock).not.toHaveBeenCalled();
    // Dispatch was never reached because the INSERT failed first.
    expect(dispatchOutboxEmailMock).not.toHaveBeenCalled();
  });

  it('escapes untrusted notification fields and drops unsafe action URLs in the email HTML', async () => {
    const repository = createNotificationRepository(
      buildNotificationRow({
        title: '<script>alert(1)</script>',
        message: 'Hello <img src=x onerror=alert(1)>',
        actionUrl: 'javascript:alert(document.cookie)',
      }),
    );

    await dispatch({
      organizationPublicId: 'org_public_id',
      jobContext: { id: 'job-1', requestId: 'request-1' },
      notificationRepository: repository,
    });

    const emailPayload = recordOutboxEmailMock.mock.calls[0]?.[0] as { html: string };
    expect(emailPayload.html).not.toContain('<script>alert(1)</script>');
    expect(emailPayload.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(emailPayload.html).not.toContain('<img src=x');
    expect(emailPayload.html).not.toContain('href="javascript:');
    expect(emailPayload.html).not.toContain('class="button"');
  });

  it('skips email channel when mail is not configured', async () => {
    isMailConfiguredMock.mockReturnValue(false);
    const repository = createNotificationRepository(buildNotificationRow());

    const result = await dispatch({
      organizationPublicId: 'org_public_id',
      jobContext: { id: 'job-1' },
      notificationRepository: repository,
    });

    expect(recordOutboxEmailMock).not.toHaveBeenCalled();
    expect(dispatchOutboxEmailMock).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: 'dispatched', channels: ['in_app:persisted'] });
  });

  it('defaults to in-app delivery when channels are absent', async () => {
    const repository = createNotificationRepository(buildNotificationRow({ data: {} }));

    const result = await dispatch({
      organizationPublicId: null,
      jobContext: { id: 'job-1' },
      notificationRepository: repository,
    });

    expect(recordOutboxEmailMock).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: 'dispatched', channels: ['in_app:persisted'] });
  });

  it('completes as skipped when the notification is gone (deleted, erased, lost to a restore)', async () => {
    const repository = createNotificationRepository(null);

    const result = await dispatch({
      organizationPublicId: null,
      notificationRepository: repository,
    });

    expect(result).toEqual({ outcome: 'skipped', reason: 'not_found' });
    expect(recordOutboxEmailMock).not.toHaveBeenCalled();
  });

  it('dedupes the outbox row on the notification public id, never the bigserial', async () => {
    const repository = createNotificationRepository(
      buildNotificationRow({ data: { channels: ['email'] } }),
    );

    await dispatch({ notificationRepository: repository });

    expect(recordOutboxEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: `notification:${NOTIFICATION_PUBLIC_ID}:email:user@example.com`,
      }),
    );
  });

  describe('processNotificationJob — the scope comes from the job, never a lookup (sec-D #10)', () => {
    beforeEach(() => {
      globalAdminMaintenanceContextMock.mockReset();
      userPrincipalContextMock.mockReset();
      organizationPrincipalContextMock.mockReset();
      createWorkerNotificationRepositoryMock.mockReset();

      userPrincipalContextMock.mockImplementation(
        async (_userPublicId: string, callback: (handle: unknown) => Promise<unknown>) =>
          callback({}),
      );
      organizationPrincipalContextMock.mockImplementation(
        async (_organizationPublicId: string, callback: (handle: unknown) => Promise<unknown>) =>
          callback({}),
      );
    });

    it("reads a notification without an organization under its recipient's scope", async () => {
      const findByPublicIdMock = vi.fn().mockResolvedValue(buildNotificationRow({ data: {} }));
      createWorkerNotificationRepositoryMock.mockReturnValue({
        findByPublicIdForDispatch: findByPublicIdMock,
      });

      const result = await processNotificationJob({
        jobData: {
          notificationPublicId: NOTIFICATION_PUBLIC_ID,
          organizationPublicId: null,
          userPublicId: 'usr_public_id_42',
          requestId: 'req-1',
        },
        jobId: 'job-1',
      });

      expect(userPrincipalContextMock).toHaveBeenCalledWith(
        'usr_public_id_42',
        expect.any(Function),
      );
      expect(findByPublicIdMock).toHaveBeenCalledWith(NOTIFICATION_PUBLIC_ID, null);
      // No tenant scope, and never the wide global-admin maintenance scope.
      expect(organizationPrincipalContextMock).not.toHaveBeenCalled();
      expect(globalAdminMaintenanceContextMock).not.toHaveBeenCalled();
      expect(result).toEqual({ outcome: 'dispatched', channels: ['in_app:persisted'] });
    });

    it("reads an organization's notification under the organization scope", async () => {
      const findByPublicIdMock = vi.fn().mockResolvedValue(buildNotificationRow({ data: {} }));
      createWorkerNotificationRepositoryMock.mockReturnValue({
        findByPublicIdForDispatch: findByPublicIdMock,
      });

      await processNotificationJob({
        jobData: {
          notificationPublicId: NOTIFICATION_PUBLIC_ID,
          organizationPublicId: 'org_public_id',
          userPublicId: 'usr_public_id_42',
        },
      });

      expect(organizationPrincipalContextMock).toHaveBeenCalledWith(
        'org_public_id',
        expect.any(Function),
      );
      expect(userPrincipalContextMock).not.toHaveBeenCalled();
      expect(globalAdminMaintenanceContextMock).not.toHaveBeenCalled();
      expect(findByPublicIdMock).toHaveBeenCalledWith(NOTIFICATION_PUBLIC_ID, 'org_public_id');
    });
  });
});
