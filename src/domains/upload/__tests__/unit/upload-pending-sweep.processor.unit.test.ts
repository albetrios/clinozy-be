import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createObjectStoragePortMock } from '@/tests/helpers/object-storage-mock.helper.js';

const findPendingUploadsOlderThanMock = vi.fn();
const setUploadStatusByInternalIdMock = vi.fn();
const markConfirmedByInternalIdMock = vi.fn();
const hardDeleteUploadsByInternalIdsMock = vi.fn();

vi.mock('@/domains/upload/upload.repository.js', () => ({
  findPendingUploadsOlderThan: (...arguments_: unknown[]) =>
    findPendingUploadsOlderThanMock(...arguments_),
  setUploadStatusByInternalId: (...arguments_: unknown[]) =>
    setUploadStatusByInternalIdMock(...arguments_),
  markConfirmedByInternalId: (...arguments_: unknown[]) =>
    markConfirmedByInternalIdMock(...arguments_),
  hardDeleteUploadsByInternalIds: (...arguments_: unknown[]) =>
    hardDeleteUploadsByInternalIdsMock(...arguments_),
}));

/** Every database step runs in its own short context; the stand-in hands out one fake handle. */
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
    throw new Error('the sweep under test must use the injected storage port');
  },
}));

vi.mock('@/shared/config/env.config.js', () => ({
  env: {
    UPLOAD_PENDING_SWEEP_GRACE_SECONDS: 3600,
    LOG_LEVEL: 'silent',
  },
}));

vi.mock('@/shared/constants/ttl.constants.js', () => ({
  PRESIGNED_URL_EXPIRY_SECONDS: 900,
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: loggerMocks,
}));

import type { PendingUploadSweepRow } from '@/domains/upload/upload.repository.js';
import { runUploadPendingSweepJob } from '@/domains/upload/workers/upload-pending-sweep.processor.js';

function makeRow(overrides: Partial<PendingUploadSweepRow>): PendingUploadSweepRow {
  return {
    id: 1,
    public_id: 'upl_public_1',
    user_id: 10,
    // sec-UP #20: the sweep refuses rows whose file_key does not start with the `pending/` prefix
    // (the HTTP confirm path's sec-UP1 invariant), so every fixture row carries it.
    file_key: 'pending/avatars/owner/1.png',
    mime_type: 'image/png',
    file_size: 1024,
    created_at: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
  };
}

function foundHead(metadata: {
  contentType: string | undefined;
  contentLength: number | undefined;
}) {
  return { kind: 'found', metadata } as const;
}

const validPngBody = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function leadingBytes(body: Buffer) {
  return { body, contentType: 'image/png', eTag: '"verified-etag"' };
}

describe('upload-pending-sweep.processor', () => {
  let objectStorage: ReturnType<typeof createObjectStoragePortMock>;

  beforeEach(() => {
    objectStorage = createObjectStoragePortMock();
    findPendingUploadsOlderThanMock.mockReset();
    setUploadStatusByInternalIdMock.mockReset();
    markConfirmedByInternalIdMock.mockReset();
    hardDeleteUploadsByInternalIdsMock.mockReset().mockResolvedValue(0);
    runGlobalRetentionWorkerJobMock.mockClear();
    loggerMocks.info.mockReset();
    loggerMocks.warn.mockReset();
    loggerMocks.error.mockReset();
  });

  it('returns zero counters when no candidates are found', async () => {
    findPendingUploadsOlderThanMock.mockResolvedValueOnce([]);

    const result = await runUploadPendingSweepJob(objectStorage);

    expect(result).toEqual({
      scannedCount: 0,
      autoConfirmedCount: 0,
      failedCount: 0,
      deletedCount: 0,
      transientCount: 0,
    });
    expect(objectStorage.headObjectResult).not.toHaveBeenCalled();
    expect(setUploadStatusByInternalIdMock).not.toHaveBeenCalled();
  });

  it('auto-confirms a verified row — copies the bytes pinned to the verified ETag, then repoints file_key (sec-UP #20)', async () => {
    const row = makeRow({ id: 1, file_key: 'pending/avatars/owner/match.png', file_size: 2048 });
    findPendingUploadsOlderThanMock.mockResolvedValueOnce([row]);
    objectStorage.headObjectResult.mockResolvedValueOnce(
      foundHead({ contentType: 'image/png', contentLength: 2048 }),
    );
    objectStorage.getObjectFirstBytes.mockResolvedValueOnce(leadingBytes(validPngBody));

    const result = await runUploadPendingSweepJob(objectStorage);

    expect(objectStorage.copyObject).toHaveBeenCalledWith({
      sourceKey: 'pending/avatars/owner/match.png',
      destinationKey: 'avatars/owner/match.png',
      contentType: 'image/png',
      sourceETag: '"verified-etag"',
    });
    expect(markConfirmedByInternalIdMock).toHaveBeenCalledWith(
      DATABASE_HANDLE,
      1,
      'avatars/owner/match.png',
    );
    expect(objectStorage.deleteObject).toHaveBeenCalledWith('pending/avatars/owner/match.png');
    expect(result.autoConfirmedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.deletedCount).toBe(0);
  });

  it('runs every database step in its own short context, never one context around the S3 calls', async () => {
    const row = makeRow({ id: 1, file_size: 2048 });
    findPendingUploadsOlderThanMock.mockResolvedValueOnce([row]);
    objectStorage.headObjectResult.mockResolvedValueOnce(
      foundHead({ contentType: 'image/png', contentLength: 2048 }),
    );
    objectStorage.getObjectFirstBytes.mockResolvedValueOnce(leadingBytes(validPngBody));

    await runUploadPendingSweepJob(objectStorage);

    // read + confirm + the (empty) orphan delete — three separate contexts.
    expect(runGlobalRetentionWorkerJobMock).toHaveBeenCalledTimes(3);
  });

  it('auto-confirms when S3 omits the Content-Type but length matches', async () => {
    const row = makeRow({ id: 5, file_size: 999 });
    findPendingUploadsOlderThanMock.mockResolvedValueOnce([row]);
    objectStorage.headObjectResult.mockResolvedValueOnce(
      foundHead({ contentType: undefined, contentLength: 999 }),
    );
    objectStorage.getObjectFirstBytes.mockResolvedValueOnce(leadingBytes(validPngBody));

    const result = await runUploadPendingSweepJob(objectStorage);

    expect(result.autoConfirmedCount).toBe(1);
    expect(markConfirmedByInternalIdMock).toHaveBeenCalled();
  });

  it('refuses to auto-confirm rows whose file_key lacks the pending prefix (sec-UP #20)', async () => {
    const row = makeRow({ id: 99, file_key: 'imports/no-prefix.png' });
    findPendingUploadsOlderThanMock.mockResolvedValueOnce([row]);

    const result = await runUploadPendingSweepJob(objectStorage);

    expect(objectStorage.headObjectResult).not.toHaveBeenCalled();
    expect(objectStorage.copyObject).not.toHaveBeenCalled();
    expect(setUploadStatusByInternalIdMock).toHaveBeenCalledWith(DATABASE_HANDLE, 99, 'FAILED');
    expect(result.failedCount).toBe(1);
  });

  it('sec-UP2: refuses to auto-confirm an SVG row (auto-confirm would bypass the DOMPurify sanitize)', async () => {
    const row = makeRow({
      id: 42,
      file_key: 'pending/avatars/owner/vector.svg',
      mime_type: 'image/svg+xml',
    });
    findPendingUploadsOlderThanMock.mockResolvedValueOnce([row]);

    const result = await runUploadPendingSweepJob(objectStorage);

    expect(objectStorage.headObjectResult).not.toHaveBeenCalled();
    expect(setUploadStatusByInternalIdMock).toHaveBeenCalledWith(DATABASE_HANDLE, 42, 'FAILED');
    expect(result.failedCount).toBe(1);
  });

  it('leaves a verified row PENDING when the copy to the final key fails', async () => {
    const row = makeRow({
      id: 55,
      file_key: 'pending/avatars/owner/copyfail.png',
      file_size: 2048,
    });
    findPendingUploadsOlderThanMock.mockResolvedValueOnce([row]);
    objectStorage.headObjectResult.mockResolvedValueOnce(
      foundHead({ contentType: 'image/png', contentLength: 2048 }),
    );
    objectStorage.getObjectFirstBytes.mockResolvedValueOnce(leadingBytes(validPngBody));
    objectStorage.copyObject.mockRejectedValueOnce(new Error('s3 copy failed'));

    const result = await runUploadPendingSweepJob(objectStorage);

    expect(markConfirmedByInternalIdMock).not.toHaveBeenCalled();
    expect(setUploadStatusByInternalIdMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ autoConfirmedCount: 0, failedCount: 0, transientCount: 1 });
    expect(hardDeleteUploadsByInternalIdsMock).toHaveBeenCalledWith(DATABASE_HANDLE, []);
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ uploadPublicId: 'upl_public_1' }),
      'upload-pending-sweep.copyToFinalKeyFailed',
    );
  });

  it('marks rows FAILED when magic bytes do not match declared content type', async () => {
    const row = makeRow({ id: 6, file_key: 'pending/avatars/owner/spoof.png', file_size: 100 });
    findPendingUploadsOlderThanMock.mockResolvedValueOnce([row]);
    objectStorage.headObjectResult.mockResolvedValueOnce(
      foundHead({ contentType: 'image/png', contentLength: 100 }),
    );
    objectStorage.getObjectFirstBytes.mockResolvedValueOnce(leadingBytes(Buffer.from('%PDF-1.4')));

    const result = await runUploadPendingSweepJob(objectStorage);

    expect(setUploadStatusByInternalIdMock).toHaveBeenCalledWith(DATABASE_HANDLE, 6, 'FAILED');
    expect(result.failedCount).toBe(1);
    expect(result.autoConfirmedCount).toBe(0);
  });

  it('leaves the row PENDING when reading the magic bytes fails — a failed read is not bad bytes', async () => {
    const row = makeRow({ id: 7, file_size: 100 });
    findPendingUploadsOlderThanMock.mockResolvedValueOnce([row]);
    objectStorage.headObjectResult.mockResolvedValueOnce(
      foundHead({ contentType: 'image/png', contentLength: 100 }),
    );
    objectStorage.getObjectFirstBytes.mockRejectedValueOnce(new Error('s3 timeout'));

    const result = await runUploadPendingSweepJob(objectStorage);

    expect(setUploadStatusByInternalIdMock).not.toHaveBeenCalled();
    expect(objectStorage.deleteObject).not.toHaveBeenCalled();
    expect(result).toMatchObject({ failedCount: 0, transientCount: 1, deletedCount: 0 });
  });

  it('orphan-deletes a row whose object vanished between the HEAD and the read', async () => {
    const row = makeRow({ id: 8, file_size: 100 });
    findPendingUploadsOlderThanMock.mockResolvedValueOnce([row]);
    objectStorage.headObjectResult.mockResolvedValueOnce(
      foundHead({ contentType: 'image/png', contentLength: 100 }),
    );
    objectStorage.getObjectFirstBytes.mockResolvedValueOnce(null);
    hardDeleteUploadsByInternalIdsMock.mockResolvedValueOnce(1);

    const result = await runUploadPendingSweepJob(objectStorage);

    expect(hardDeleteUploadsByInternalIdsMock).toHaveBeenCalledWith(DATABASE_HANDLE, [8]);
    expect(result.deletedCount).toBe(1);
  });

  it('fails — never deletes — an object S3 reports without a length', async () => {
    const row = makeRow({ id: 9 });
    findPendingUploadsOlderThanMock.mockResolvedValueOnce([row]);
    objectStorage.headObjectResult.mockResolvedValueOnce(
      foundHead({ contentType: 'image/png', contentLength: undefined }),
    );

    const result = await runUploadPendingSweepJob(objectStorage);

    expect(setUploadStatusByInternalIdMock).toHaveBeenCalledWith(DATABASE_HANDLE, 9, 'FAILED');
    expect(objectStorage.deleteObject).not.toHaveBeenCalled();
    expect(hardDeleteUploadsByInternalIdsMock).toHaveBeenCalledWith(DATABASE_HANDLE, []);
    expect(result.failedCount).toBe(1);
  });

  it('marks rows FAILED when the S3 object content length does not match', async () => {
    const row = makeRow({ id: 2, file_key: 'pending/avatars/owner/mismatch.png', file_size: 100 });
    findPendingUploadsOlderThanMock.mockResolvedValueOnce([row]);
    objectStorage.headObjectResult.mockResolvedValueOnce(
      foundHead({ contentType: 'image/png', contentLength: 50 }),
    );

    const result = await runUploadPendingSweepJob(objectStorage);

    expect(setUploadStatusByInternalIdMock).toHaveBeenCalledWith(DATABASE_HANDLE, 2, 'FAILED');
    expect(result.failedCount).toBe(1);
  });

  it('hard-deletes rows whose S3 object is missing', async () => {
    const row = makeRow({ id: 3, file_key: 'pending/avatars/owner/orphan.png' });
    findPendingUploadsOlderThanMock.mockResolvedValueOnce([row]);
    objectStorage.headObjectResult.mockResolvedValueOnce({ kind: 'not_found' });
    hardDeleteUploadsByInternalIdsMock.mockResolvedValueOnce(1);

    const result = await runUploadPendingSweepJob(objectStorage);

    expect(objectStorage.deleteObject).toHaveBeenCalledWith('pending/avatars/owner/orphan.png');
    expect(hardDeleteUploadsByInternalIdsMock).toHaveBeenCalledWith(DATABASE_HANDLE, [3]);
    expect(result.deletedCount).toBe(1);
  });

  it('still deletes the orphan row when the defensive S3 delete fails (logged)', async () => {
    const row = makeRow({ id: 4 });
    findPendingUploadsOlderThanMock.mockResolvedValueOnce([row]);
    objectStorage.headObjectResult.mockResolvedValueOnce({ kind: 'not_found' });
    objectStorage.deleteObject.mockResolvedValueOnce({ kind: 'failed', circuitOpen: false });
    hardDeleteUploadsByInternalIdsMock.mockResolvedValueOnce(1);

    const result = await runUploadPendingSweepJob(objectStorage);

    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ uploadPublicId: 'upl_public_1' }),
      'upload-pending-sweep.s3DeleteFailed',
    );
    expect(result.deletedCount).toBe(1);
  });

  it('mixes auto-confirm, fail, and delete results in a single batch', async () => {
    const rows = [
      makeRow({ id: 11, file_size: 100 }),
      makeRow({ id: 12, file_size: 200 }),
      makeRow({ id: 13, file_size: 300 }),
    ];
    findPendingUploadsOlderThanMock.mockResolvedValueOnce(rows);
    objectStorage.headObjectResult
      .mockResolvedValueOnce(foundHead({ contentType: undefined, contentLength: 100 }))
      .mockResolvedValueOnce(foundHead({ contentType: undefined, contentLength: 999 }))
      .mockResolvedValueOnce({ kind: 'not_found' });
    objectStorage.getObjectFirstBytes.mockResolvedValueOnce(leadingBytes(validPngBody));
    hardDeleteUploadsByInternalIdsMock.mockResolvedValueOnce(1);

    const result = await runUploadPendingSweepJob(objectStorage);

    expect(result).toEqual({
      scannedCount: 3,
      autoConfirmedCount: 1,
      failedCount: 1,
      deletedCount: 1,
      transientCount: 0,
    });
  });

  // audit-#5: a transient HEAD failure must NOT hard-delete the row. The row is left PENDING
  // (no S3 delete, no DB delete, not marked FAILED) for the next scheduled sweep.
  it('leaves a row PENDING when the HEAD fails transiently (never orphan-deletes on an outage)', async () => {
    const row = makeRow({ id: 21, file_key: 'pending/avatars/owner/outage.png' });
    findPendingUploadsOlderThanMock.mockResolvedValueOnce([row]);
    objectStorage.headObjectResult.mockResolvedValueOnce({
      kind: 'transient_error',
      cause: new Error('s3 timeout'),
    });

    const result = await runUploadPendingSweepJob(objectStorage);

    expect(objectStorage.deleteObject).not.toHaveBeenCalled();
    expect(hardDeleteUploadsByInternalIdsMock).toHaveBeenCalledWith(DATABASE_HANDLE, []);
    expect(setUploadStatusByInternalIdMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ transientCount: 1, deletedCount: 0, failedCount: 0 });
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ uploadPublicId: 'upl_public_1' }),
      'upload-pending-sweep.transientStorageSkipped',
    );
  });

  it('uses presign expiry + grace as the cutoff passed to the repository', async () => {
    findPendingUploadsOlderThanMock.mockResolvedValueOnce([]);
    const now = Date.now();

    await runUploadPendingSweepJob(objectStorage);

    const cutoff = findPendingUploadsOlderThanMock.mock.calls[0]?.[1] as Date;
    const expectedCutoffMs = now - (900 + 3600) * 1000;
    expect(Math.abs(cutoff.getTime() - expectedCutoffMs)).toBeLessThan(1000);
  });
});
