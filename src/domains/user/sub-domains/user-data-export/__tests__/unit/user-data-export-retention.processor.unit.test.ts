import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createObjectStoragePortMock } from '@/tests/helpers/object-storage-mock.helper.js';

const findExpiredExportsWithObjectBeforeMock = vi.fn();
const hardDeleteExportsByInternalIdsMock = vi.fn();
vi.mock('@/domains/user/sub-domains/user-data-export/user-data-export.repository.js', () => ({
  findExpiredExportsWithObjectBefore: (...arguments_: unknown[]) =>
    findExpiredExportsWithObjectBeforeMock(...arguments_),
  hardDeleteExportsByInternalIds: (...arguments_: unknown[]) =>
    hardDeleteExportsByInternalIdsMock(...arguments_),
}));

const DATABASE_HANDLE = { kind: 'global-retention' };
vi.mock('@/infrastructure/queue/worker-runtime/worker-processor.util.js', () => ({
  runGlobalRetentionWorkerJob: (processor: (databaseHandle: unknown) => Promise<unknown>) =>
    processor(DATABASE_HANDLE),
}));

vi.mock('@/infrastructure/storage/s3-adapter.js', () => ({
  getDefaultS3ObjectStorageAdapter: () => {
    throw new Error('the job under test must use the injected storage port');
  },
}));

const { loggerWarnMock } = vi.hoisted(() => ({ loggerWarnMock: vi.fn() }));
vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: loggerWarnMock, error: vi.fn() },
}));

import { runUserDataExportRetentionJob } from '@/domains/user/sub-domains/user-data-export/workers/user-data-export-retention.processor.js';

const EXPIRED_EXPORTS = [
  { id: 1, public_id: 'exp_1', s3_key: 'user-data-export/user/exp_1.json.gz' },
  { id: 2, public_id: 'exp_2', s3_key: 'user-data-export/user/exp_2.json.gz' },
];

describe('user-data-export-retention.processor', () => {
  beforeEach(() => {
    findExpiredExportsWithObjectBeforeMock.mockReset();
    hardDeleteExportsByInternalIdsMock.mockReset().mockResolvedValue(0);
    loggerWarnMock.mockReset();
  });

  it('deletes the S3 objects of expired exports, then their rows', async () => {
    findExpiredExportsWithObjectBeforeMock.mockResolvedValueOnce(EXPIRED_EXPORTS);
    const objectStorage = createObjectStoragePortMock();

    const result = await runUserDataExportRetentionJob(objectStorage);

    expect(objectStorage.deleteObject).toHaveBeenCalledWith('user-data-export/user/exp_1.json.gz');
    expect(objectStorage.deleteObject).toHaveBeenCalledWith('user-data-export/user/exp_2.json.gz');
    expect(hardDeleteExportsByInternalIdsMock).toHaveBeenCalledWith(DATABASE_HANDLE, [1, 2]);
    expect(result).toEqual({ deletedCount: 2, keptCount: 0, stoppedOnOpenCircuit: false });
  });

  it('keeps the row of an export whose S3 object could not be deleted — personal data never outlives its row', async () => {
    findExpiredExportsWithObjectBeforeMock.mockResolvedValueOnce(EXPIRED_EXPORTS);
    const objectStorage = createObjectStoragePortMock();
    objectStorage.deleteObject
      .mockResolvedValueOnce({ kind: 'failed', circuitOpen: false })
      .mockResolvedValueOnce({ kind: 'deleted' });

    const result = await runUserDataExportRetentionJob(objectStorage);

    expect(hardDeleteExportsByInternalIdsMock).toHaveBeenCalledWith(DATABASE_HANDLE, [2]);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { exportPublicId: 'exp_1', s3Key: 'user-data-export/user/exp_1.json.gz' },
      'user-data-export-retention.objectDeleteFailed',
    );
    expect(result).toMatchObject({ deletedCount: 1, keptCount: 1 });
  });

  it('stops on an open S3 circuit without touching the remaining rows', async () => {
    findExpiredExportsWithObjectBeforeMock.mockResolvedValueOnce(EXPIRED_EXPORTS);
    const objectStorage = createObjectStoragePortMock();
    objectStorage.deleteObject.mockResolvedValueOnce({ kind: 'failed', circuitOpen: true });

    const result = await runUserDataExportRetentionJob(objectStorage);

    expect(objectStorage.deleteObject).toHaveBeenCalledOnce();
    expect(hardDeleteExportsByInternalIdsMock).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedCount: 0, keptCount: 1, stoppedOnOpenCircuit: true });
  });
});
