import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = {
  findByPublicId: vi.fn(),
  setThumbnailKey: vi.fn(),
  clearThumbnailKey: vi.fn(),
};
let insideContext = false;

vi.mock('@/infrastructure/queue/worker-runtime/worker-processor.util.js', () => ({
  runOrganizationScopedWorkerJob: vi.fn(
    async ({ processor }: { processor: (handle: unknown) => Promise<unknown> }) => {
      insideContext = true;
      try {
        return await processor({});
      } finally {
        insideContext = false;
      }
    },
  ),
}));

vi.mock(
  '@/domains/app/sub-domains/patients/patient-images/patient-image-thumbnail.repository.js',
  () => ({ createWorkerPatientImageThumbnailRepository: () => repository }),
);

import { syncPatientImageThumbnail } from '@/domains/app/sub-domains/patients/patient-images/workers/patient-image-thumbnail.processor.js';

const ORGANIZATION = 'org_abc';
const FILE_KEY = `organization-files/${ORGANIZATION}/photo.jpg`;
const THUMBNAIL_KEY = `organization-files/${ORGANIZATION}/photo.thumb.webp`;

/** One photo's thumbnail kept in step with its row, the storage call outside any database context. */
describe('syncPatientImageThumbnail', () => {
  const storage = {
    createThumbnail: vi.fn(async () => {
      expect(insideContext).toBe(false);
      return { kind: 'created' as const, thumbnailKey: THUMBNAIL_KEY };
    }),
    deleteThumbnail: vi.fn(async () => {
      expect(insideContext).toBe(false);
    }),
  };
  const run = () =>
    syncPatientImageThumbnail({
      organizationPublicId: ORGANIZATION,
      patientImagePublicId: 'pimg_abc',
      storage,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    repository.setThumbnailKey.mockResolvedValue(true);
    repository.clearThumbnailKey.mockResolvedValue(true);
  });

  it('makes a live photo’s thumbnail and records its key', async () => {
    repository.findByPublicId.mockResolvedValue({
      id: 7,
      fileKey: FILE_KEY,
      thumbnailKey: null,
      deletedAt: null,
    });
    await expect(run()).resolves.toEqual({ outcome: 'created', thumbnailKey: THUMBNAIL_KEY });
    expect(storage.createThumbnail).toHaveBeenCalledWith({
      organizationPublicId: ORGANIZATION,
      fileKey: FILE_KEY,
    });
    expect(repository.setThumbnailKey).toHaveBeenCalledWith({ id: 7, thumbnailKey: THUMBNAIL_KEY });
  });

  it('removes a deleted photo’s thumbnail and clears its key', async () => {
    repository.findByPublicId.mockResolvedValue({
      id: 7,
      fileKey: FILE_KEY,
      thumbnailKey: THUMBNAIL_KEY,
      deletedAt: new Date(),
    });
    await expect(run()).resolves.toEqual({ outcome: 'removed', thumbnailKey: THUMBNAIL_KEY });
    expect(storage.deleteThumbnail).toHaveBeenCalledWith({
      organizationPublicId: ORGANIZATION,
      thumbnailKey: THUMBNAIL_KEY,
    });
    expect(repository.clearThumbnailKey).toHaveBeenCalledWith({
      id: 7,
      thumbnailKey: THUMBNAIL_KEY,
    });
  });

  it.each([
    ['a photo that is gone', null, 'row_gone'],
    [
      'a live photo that has one',
      { id: 7, fileKey: FILE_KEY, thumbnailKey: THUMBNAIL_KEY, deletedAt: null },
      'in_sync',
    ],
    [
      'a deleted photo without one',
      { id: 7, fileKey: FILE_KEY, thumbnailKey: null, deletedAt: new Date() },
      'in_sync',
    ],
  ])('skips %s without touching storage', async (_label, row, reason) => {
    repository.findByPublicId.mockResolvedValue(row);
    await expect(run()).resolves.toEqual({ outcome: 'skipped', reason });
    expect(storage.createThumbnail).not.toHaveBeenCalled();
    expect(storage.deleteThumbnail).not.toHaveBeenCalled();
  });

  it('leaves the photo on its full-size fallback when the source cannot be used', async () => {
    repository.findByPublicId.mockResolvedValue({
      id: 7,
      fileKey: FILE_KEY,
      thumbnailKey: null,
      deletedAt: null,
    });
    storage.createThumbnail.mockResolvedValueOnce({
      kind: 'skipped',
      reason: 'source_unusable',
    } as never);
    await expect(run()).resolves.toEqual({ outcome: 'skipped', reason: 'source_unusable' });
    expect(repository.setThumbnailKey).not.toHaveBeenCalled();
  });

  it('lets a storage failure through so BullMQ retries, writing nothing', async () => {
    repository.findByPublicId.mockResolvedValue({
      id: 7,
      fileKey: FILE_KEY,
      thumbnailKey: null,
      deletedAt: null,
    });
    storage.createThumbnail.mockRejectedValueOnce(new Error('S3 503'));
    await expect(run()).rejects.toThrow('S3 503');
    expect(repository.setThumbnailKey).not.toHaveBeenCalled();
  });
});
