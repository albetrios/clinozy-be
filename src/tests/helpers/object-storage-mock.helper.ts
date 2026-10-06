import { vi, type Mocked } from 'vitest';
import type { ObjectStoragePort } from '@/infrastructure/storage/object-storage.port.js';

/** Minimal {@link ObjectStoragePort} mock for domain service unit tests. */
export function createObjectStoragePortMock(
  overrides: Partial<ObjectStoragePort> = {},
): Mocked<ObjectStoragePort> {
  return {
    createPresignedUploadUrl: vi.fn().mockResolvedValue('https://presigned.example/upload'),
    createPresignedUploadPost: vi.fn().mockResolvedValue({
      url: 'https://presigned.example/post',
      fields: { key: 'k', 'Content-Type': 'image/png' },
    }),
    verifyUploadedObject: vi.fn().mockResolvedValue({
      kind: 'verified',
      metadata: { contentType: 'image/png', contentLength: 100 },
    }),
    headObjectResult: vi.fn().mockResolvedValue({
      kind: 'found',
      metadata: { contentType: 'image/png', contentLength: 100 },
    }),
    headObject: vi.fn().mockResolvedValue({ contentType: 'image/png', contentLength: 100 }),
    deleteObject: vi.fn().mockResolvedValue({ kind: 'deleted' }),
    putObject: vi.fn().mockResolvedValue(undefined),
    copyObject: vi.fn().mockResolvedValue({ kind: 'copied' }),
    getObject: vi.fn().mockResolvedValue({ body: Buffer.from(''), contentType: 'image/png' }),
    getObjectFirstBytes: vi
      .fn()
      .mockResolvedValue({ body: Buffer.from(''), contentType: 'image/png', eTag: '"etag"' }),
    createPresignedDownloadUrl: vi.fn().mockResolvedValue('https://presigned.example/download'),
    ...overrides,
  } as Mocked<ObjectStoragePort>;
}
