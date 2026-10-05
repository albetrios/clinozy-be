import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createObjectStoragePortMock } from '@/tests/helpers/object-storage-mock.helper.js';

const findTombstonedUploadsBeforeMock = vi.fn();
const hardDeleteUploadsByInternalIdsMock = vi.fn();
vi.mock('@/domains/upload/upload.repository.js', () => ({
  findTombstonedUploadsBefore: (...arguments_: unknown[]) =>
    findTombstonedUploadsBeforeMock(...arguments_),
  hardDeleteUploadsByInternalIds: (...arguments_: unknown[]) =>
    hardDeleteUploadsByInternalIdsMock(...arguments_),
}));

const DATABASE_HANDLE = { kind: 'global-retention' };
const runGlobalRetentionWorkerJobMock = vi.fn(
  async (processor: (databaseHandle: unknown) => Promise<unknown>) => processor(DATABASE_HANDLE),
);
vi.mock('@/infrastructure/queue/worker-runtime/worker-processor.util.js', () => ({
  runGlobalRetentionWorkerJob: (processor: (databaseHandle: unknown) => Promise<unknown>) =>
    runGlobalRetentionWorkerJobMock(processor),
}));

vi.mock('@/infrastructure/storage/s3-adapter.js', () => ({
  getDefaultS3ObjectStorageAdapter: () => {
    throw new Error('the job under test must use the injected storage port');
  },
}));

vi.mock('@/shared/config/env.config.js', () => ({
  env: { TOMBSTONE_RETENTION_DAYS: 30, LOG_LEVEL: 'silent' },
}));

const { loggerInfoMock, loggerWarnMock } = vi.hoisted(() => ({
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));
vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: loggerInfoMock, warn: loggerWarnMock, error: vi.fn() },
}));

import { runUploadTombstoneRetentionJob } from '@/domains/upload/workers/upload-tombstone-retention.processor.js';

describe('upload-tombstone-retention.processor', () => {
  beforeEach(() => {
    findTombstonedUploadsBeforeMock.mockReset();
    hardDeleteUploadsByInternalIdsMock.mockReset().mockResolvedValue(0);
    runGlobalRetentionWorkerJobMock.mockClear();
    loggerInfoMock.mockReset();
    loggerWarnMock.mockReset();
  });

  it('reads tombstones older than TOMBSTONE_RETENTION_DAYS, by keyset page', async () => {
    findTombstonedUploadsBeforeMock.mockResolvedValueOnce([]);
    const now = Date.now();

    await runUploadTombstoneRetentionJob(createObjectStoragePortMock());

    const [databaseHandle, page] = findTombstonedUploadsBeforeMock.mock.calls[0] as [
      unknown,
      { cutoff: Date; afterId: number; limit: number },
    ];
    expect(databaseHandle).toBe(DATABASE_HANDLE);
    expect(page.afterId).toBe(0);
    expect(page.limit).toBe(500);
    const expectedCutoffMs = now - 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(page.cutoff.getTime() - expectedCutoffMs)).toBeLessThan(5_000);
  });

  it('hard-deletes each row only after its object is gone', async () => {
    findTombstonedUploadsBeforeMock.mockResolvedValueOnce([
      { id: 1, public_id: 'upl_1', file_key: 'uploads/old-1.png' },
      { id: 2, public_id: 'upl_2', file_key: 'uploads/old-2.png' },
    ]);
    const objectStorage = createObjectStoragePortMock();

    const result = await runUploadTombstoneRetentionJob(objectStorage);

    expect(objectStorage.deleteObject).toHaveBeenCalledTimes(2);
    expect(hardDeleteUploadsByInternalIdsMock).toHaveBeenCalledWith(DATABASE_HANDLE, [1, 2]);
    expect(result).toEqual({ deletedCount: 2, keptCount: 0, stoppedOnOpenCircuit: false });
  });

  it('keeps the row of an object S3 refused to delete — logged by public id — for the next run', async () => {
    findTombstonedUploadsBeforeMock.mockResolvedValueOnce([
      { id: 1, public_id: 'upl_1', file_key: 'uploads/old-1.png' },
      { id: 2, public_id: 'upl_2', file_key: 'uploads/old-2.png' },
    ]);
    const objectStorage = createObjectStoragePortMock();
    objectStorage.deleteObject
      .mockResolvedValueOnce({ kind: 'failed', circuitOpen: false })
      .mockResolvedValueOnce({ kind: 'deleted' });

    const result = await runUploadTombstoneRetentionJob(objectStorage);

    expect(hardDeleteUploadsByInternalIdsMock).toHaveBeenCalledWith(DATABASE_HANDLE, [2]);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { uploadPublicId: 'upl_1', fileKey: 'uploads/old-1.png' },
      'upload-tombstone-retention.objectDeleteFailed',
    );
    expect(result.keptCount).toBe(1);
  });

  it('logs the purge counts on completion', async () => {
    findTombstonedUploadsBeforeMock.mockResolvedValueOnce([
      { id: 11, public_id: 'upl_11', file_key: 'uploads/k.png' },
    ]);

    await runUploadTombstoneRetentionJob(createObjectStoragePortMock());

    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({ deletedCount: 1, retentionDays: 30 }),
      'upload-tombstone-retention.completed',
    );
  });
});
