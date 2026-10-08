import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { runMembershipTombstoneRetentionJob } from '@/domains/tenancy/sub-domains/membership/workers/membership-tombstone-retention.processor.js';

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

describe('membership-tombstone-retention.processor boundary cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T12:00:00.000Z'));
    deleteInBatchesByConditionMock.mockReset();
    loggerInfoMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a strict older-than cutoff predicate for tombstones', async () => {
    deleteInBatchesByConditionMock.mockResolvedValue({ deletedCount: 4, blockedCount: 0 });

    const result = await runMembershipTombstoneRetentionJob({} as never);

    expect(deleteInBatchesByConditionMock).toHaveBeenCalledOnce();
    expect(deleteInBatchesByConditionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        logContext: 'membership-tombstone-retention',
        tableLabel: 'tenancy.memberships',
      }),
    );
    const options = deleteInBatchesByConditionMock.mock.calls[0]![0] as { whereCondition: SQL };
    const query = new PgDialect().sqlToQuery(options.whereCondition);
    expect(query.sql).toMatch(/"deleted_at" is not null/i);
    expect(query.sql).toMatch(/"deleted_at" < \$1/);
    expect(query.sql).toMatch(/ and /i);
    expect(query.params).toHaveLength(1);
    const cutoff = query.params[0];
    expect(cutoff instanceof Date ? cutoff.toISOString() : cutoff).toBe('2026-09-08T12:00:00.000Z');
    expect(result).toEqual({ deletedCount: 4, blockedCount: 0 });
  });

  it('returns zero counts when the batch deleter reports no matching rows', async () => {
    deleteInBatchesByConditionMock.mockResolvedValue({ deletedCount: 0, blockedCount: 0 });

    const result = await runMembershipTombstoneRetentionJob({} as never);

    expect(deleteInBatchesByConditionMock).toHaveBeenCalledOnce();
    expect(result).toEqual({ deletedCount: 0, blockedCount: 0 });
  });

  it('logs purge counts on completion', async () => {
    deleteInBatchesByConditionMock.mockResolvedValue({ deletedCount: 9, blockedCount: 1 });

    await runMembershipTombstoneRetentionJob({} as never);

    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({ deletedCount: 9, blockedCount: 1, retentionDays: 30 }),
      'membership-tombstone-retention.completed',
    );
  });
});
