import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The export queue's lost-enqueue sweep: exports still `pending` past the cutoff are re-added (the
 * job id is the export's public id, so a live job absorbs the add), and one failed add never stops
 * the rest.
 */
const findStalePendingExportsMock = vi.fn();
const enqueueUserDataExportMock = vi.fn();

vi.mock('@/domains/user/sub-domains/user-data-export/user-data-export.repository.js', () => ({
  findStalePendingExports: (...arguments_: unknown[]) => findStalePendingExportsMock(...arguments_),
}));
vi.mock('@/domains/user/sub-domains/user-data-export/queues/user-data-export.queue.js', () => ({
  enqueueUserDataExport: (...arguments_: unknown[]) => enqueueUserDataExportMock(...arguments_),
}));
vi.mock('@/infrastructure/queue/worker-runtime/worker-processor.util.js', () => ({
  runGlobalRetentionWorkerJob: (processor: (databaseHandle: unknown) => Promise<unknown>) =>
    processor({ tag: 'retention-handle' }),
}));

describe('runUserDataExportReclaimJob', () => {
  beforeEach(() => {
    findStalePendingExportsMock.mockReset();
    enqueueUserDataExportMock.mockReset();
  });

  it('re-adds every stale pending export, read from five minutes before now', async () => {
    findStalePendingExportsMock.mockResolvedValue([
      { exportPublicId: 'exp_a', userPublicId: 'usr_a' },
      { exportPublicId: 'exp_b', userPublicId: 'usr_b' },
    ]);
    enqueueUserDataExportMock.mockResolvedValue(undefined);
    const { runUserDataExportReclaimJob } = await import(
      '@/domains/user/sub-domains/user-data-export/workers/user-data-export-reclaim.processor.js'
    );

    const result = await runUserDataExportReclaimJob({ now: new Date('2026-10-10T12:00:00.000Z') });

    expect(findStalePendingExportsMock).toHaveBeenCalledWith(
      { tag: 'retention-handle' },
      { createdBefore: new Date('2026-10-10T11:55:00.000Z'), limit: 100 },
    );
    expect(enqueueUserDataExportMock).toHaveBeenCalledWith({
      exportPublicId: 'exp_a',
      userPublicId: 'usr_a',
    });
    expect(result).toEqual({ scannedCount: 2, addedCount: 2 });
  });

  it('keeps going when one add fails (Redis still refusing writes)', async () => {
    findStalePendingExportsMock.mockResolvedValue([
      { exportPublicId: 'exp_a', userPublicId: 'usr_a' },
      { exportPublicId: 'exp_b', userPublicId: 'usr_b' },
    ]);
    enqueueUserDataExportMock
      .mockRejectedValueOnce(new Error('redis unavailable'))
      .mockResolvedValueOnce(undefined);
    const { runUserDataExportReclaimJob } = await import(
      '@/domains/user/sub-domains/user-data-export/workers/user-data-export-reclaim.processor.js'
    );

    await expect(runUserDataExportReclaimJob()).resolves.toEqual({
      scannedCount: 2,
      addedCount: 1,
    });
  });
});
