import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { notifications } from '@/domains/notify/sub-domains/notification/notification.schema.js';
import { user_data_exports } from '@/domains/user/sub-domains/user-data-export/user-data-export.schema.js';
import { executeCommitDispatchTask } from '@/infrastructure/queue/commit-dispatch/commit-dispatch.executor.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestNotification } from '@/tests/factories/notification.factory.js';
import { createTestUserDataExport } from '@/tests/factories/user-data-export.factory.js';

const { enqueueNotificationMock, enqueueUserDataExportMock } = vi.hoisted(() => ({
  enqueueNotificationMock: vi.fn(),
  enqueueUserDataExportMock: vi.fn(),
}));

vi.mock(
  '@/domains/notify/sub-domains/notification/queues/notification.queue.js',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    enqueueNotification: (...arguments_: unknown[]) => enqueueNotificationMock(...arguments_),
  }),
);

vi.mock(
  '@/domains/user/sub-domains/user-data-export/queues/user-data-export.queue.js',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    enqueueUserDataExport: (...arguments_: unknown[]) => enqueueUserDataExportMock(...arguments_),
  }),
);

async function notificationExists(publicId: string): Promise<boolean> {
  const rows = await getOperatorDatabase()
    .select({ id: notifications.id })
    .from(notifications)
    .where(eq(notifications.public_id, publicId));
  return rows.length > 0;
}

async function readExport(publicId: string) {
  const [row] = await getOperatorDatabase()
    .select({ status: user_data_exports.status, error_code: user_data_exports.error_code })
    .from(user_data_exports)
    .where(eq(user_data_exports.public_id, publicId));
  return row;
}

/**
 * When a post-commit enqueue fails, the dispatch cleans up the row it was for. Both clean-ups run
 * under the recipient's / owner's own scope, by public id — on the RLS-subject application role
 * (`pnpm test:rls-role`) that scope is what lets the write reach the row. The notification
 * clean-up used to run under the system-table maintenance scope, which no notification policy
 * matches: on that role it deleted nothing and the never-dispatched row stayed in the inbox.
 */
describe('Integration: post-commit dispatch clean-up after a failed enqueue', () => {
  beforeEach(async () => {
    await cleanupDatabase();
    enqueueNotificationMock.mockReset();
    enqueueNotificationMock.mockRejectedValue(new Error('redis unavailable'));
    enqueueUserDataExportMock.mockReset();
    enqueueUserDataExportMock.mockRejectedValue(new Error('redis unavailable'));
  });

  it("deletes an organization's orphan notification and leaves the recipient's others", async () => {
    const user = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: user.id });
    const orphan = await createTestNotification({
      userId: user.id,
      organizationId: organization.id,
    });
    const kept = await createTestNotification({ userId: user.id, organizationId: organization.id });

    await executeCommitDispatchTask({
      type: 'notification',
      notificationPublicId: orphan.public_id,
      organizationPublicId: organization.public_id,
      userPublicId: user.public_id,
    });

    expect(await notificationExists(orphan.public_id)).toBe(false);
    expect(await notificationExists(kept.public_id)).toBe(true);
  });

  it('deletes an orphan notification without an organization', async () => {
    const user = await createTestUser();
    const orphan = await createTestNotification({ userId: user.id });

    await executeCommitDispatchTask({
      type: 'notification',
      notificationPublicId: orphan.public_id,
      organizationPublicId: null,
      userPublicId: user.public_id,
    });

    expect(await notificationExists(orphan.public_id)).toBe(false);
  });

  // Only the RLS-subject role (`pnpm test:rls-role`, which sets TEST_DATABASE_ROLE) enforces the
  // policy; the other lanes connect as a role that bypasses RLS.
  it.runIf(process.env.TEST_DATABASE_ROLE !== undefined)(
    "does not reach another user's notification through a mismatched task",
    async () => {
      const owner = await createTestUser();
      const otherUser = await createTestUser();
      const foreign = await createTestNotification({ userId: otherUser.id });

      await executeCommitDispatchTask({
        type: 'notification',
        notificationPublicId: foreign.public_id,
        organizationPublicId: null,
        userPublicId: owner.public_id,
      });

      expect(await notificationExists(foreign.public_id)).toBe(true);
    },
  );

  it("fails a still-pending export under its owner's scope", async () => {
    const user = await createTestUser();
    const exportRow = await createTestUserDataExport({ userId: user.id });

    await executeCommitDispatchTask({
      type: 'user_data_export',
      exportPublicId: exportRow.public_id,
      userPublicId: user.public_id,
    });

    expect(await readExport(exportRow.public_id)).toEqual({
      status: 'failed',
      error_code: 'enqueue_failed',
    });
  });

  it('leaves an export a worker already picked up alone', async () => {
    const user = await createTestUser();
    const exportRow = await createTestUserDataExport({ userId: user.id, status: 'processing' });

    await executeCommitDispatchTask({
      type: 'user_data_export',
      exportPublicId: exportRow.public_id,
      userPublicId: user.public_id,
    });

    expect(await readExport(exportRow.public_id)).toEqual({
      status: 'processing',
      error_code: null,
    });
  });
});
