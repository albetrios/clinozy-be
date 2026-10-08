import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, isNotNull, lt, lte } from 'drizzle-orm';
import { webhooks } from '@/domains/notify/sub-domains/webhook/webhook.schema.js';
import { runWebhookTombstoneRetentionJob } from '@/domains/notify/sub-domains/webhook/workers/webhook-tombstone-retention.processor.js';

const deleteInBatchesByConditionMock = vi.fn();

vi.mock('@/infrastructure/database/utils/batch-delete.util.js', () => ({
  deleteInBatchesByCondition: (...arguments_: unknown[]) =>
    deleteInBatchesByConditionMock(...arguments_),
}));

vi.mock('@/shared/config/env.config.js', () => ({
  env: { TOMBSTONE_RETENTION_DAYS: 30, LOG_LEVEL: 'silent' },
}));

const { loggerInfoMock } = vi.hoisted(() => ({ loggerInfoMock: vi.fn() }));
vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: loggerInfoMock, warn: vi.fn(), error: vi.fn() },
}));

describe('webhook-tombstone-retention.processor boundary cases', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T12:00:00.000Z'));
    deleteInBatchesByConditionMock.mockReset();
    loggerInfoMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes only non-null tombstones strictly older than the cutoff to batch deletion', async () => {
    deleteInBatchesByConditionMock.mockResolvedValue({ deletedCount: 2, blockedCount: 0 });

    const result = await runWebhookTombstoneRetentionJob({} as never);

    expect(deleteInBatchesByConditionMock).toHaveBeenCalledOnce();
    expect(deleteInBatchesByConditionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        table: webhooks,
        idColumn: webhooks.id,
        whereCondition: and(
          isNotNull(webhooks.deleted_at),
          lt(webhooks.deleted_at, new Date('2026-09-08T12:00:00.000Z')),
        ),
        logContext: 'webhook-tombstone-retention',
        tableLabel: 'notify.webhooks',
      }),
    );
    expect(result).toEqual({ deletedCount: 2, blockedCount: 0 });
  });

  it('uses a strict tombstone cutoff even when the deletion helper matches no rows', async () => {
    deleteInBatchesByConditionMock.mockResolvedValue({ deletedCount: 0, blockedCount: 0 });

    const result = await runWebhookTombstoneRetentionJob({} as never);

    expect(deleteInBatchesByConditionMock).toHaveBeenCalledOnce();
    expect(result).toEqual({ deletedCount: 0, blockedCount: 0 });
    const options = deleteInBatchesByConditionMock.mock.calls[0]![0] as { whereCondition: unknown };
    const cutoff = new Date('2026-09-08T12:00:00.000Z');
    expect(options.whereCondition).toEqual(
      and(isNotNull(webhooks.deleted_at), lt(webhooks.deleted_at, cutoff)),
    );
    expect(options.whereCondition).not.toEqual(
      and(isNotNull(webhooks.deleted_at), lte(webhooks.deleted_at, cutoff)),
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      { retentionDays: 30, cutoffDate: cutoff.toISOString() },
      'webhook-tombstone-retention.starting',
    );
  });

  it('logs purge counts on completion', async () => {
    deleteInBatchesByConditionMock.mockResolvedValue({ deletedCount: 8, blockedCount: 0 });

    await runWebhookTombstoneRetentionJob({} as never);

    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({ deletedCount: 8, blockedCount: 0, retentionDays: 30 }),
      'webhook-tombstone-retention.completed',
    );
  });
});
