import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lt } from 'drizzle-orm';
import { notifications } from '@/domains/notify/sub-domains/notification/notification.schema.js';
import { runNotificationRetentionJob } from '@/domains/notify/sub-domains/notification/workers/notification-retention.processor.js';

const deleteInBatchesByConditionMock = vi.fn();

vi.mock('@/infrastructure/database/utils/batch-delete.util.js', () => ({
  deleteInBatchesByCondition: (...arguments_: unknown[]) =>
    deleteInBatchesByConditionMock(...arguments_),
}));

vi.mock('@/shared/config/env.config.js', () => ({
  env: { NOTIFICATION_RETENTION_DAYS: 365, LOG_LEVEL: 'silent' },
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('notification-retention.worker', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T12:00:00.000Z'));
    deleteInBatchesByConditionMock.mockReset();
    deleteInBatchesByConditionMock.mockResolvedValue({ deletedCount: 2, blockedCount: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runNotificationRetentionJob passes a strict age predicate to batch deletion', async () => {
    const result = await runNotificationRetentionJob({} as never);

    expect(deleteInBatchesByConditionMock).toHaveBeenCalledOnce();
    expect(deleteInBatchesByConditionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        table: notifications,
        idColumn: notifications.id,
        whereCondition: lt(notifications.created_at, new Date('2025-10-08T12:00:00.000Z')),
        logContext: 'notification-retention',
        tableLabel: 'notify.notifications',
      }),
    );
    expect(result).toEqual({ deletedCount: 2, blockedCount: 0 });
  });
});
