import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@/shared/errors/index.js';
import { UploadService } from '@/domains/upload/upload.service.js';
import type { UploadRepository } from '@/domains/upload/upload.repository.js';
import type { UserService } from '@/domains/user/user.service.js';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { createObjectStoragePortMock } from '@/tests/helpers/object-storage-mock.helper.js';

vi.mock('@/shared/config/env.config.js', () => ({
  getEnv: vi.fn(() => ({ S3_BUCKET: 'test-bucket', LOG_LEVEL: 'silent' })),
  env: { S3_BUCKET: 'test-bucket', LOG_LEVEL: 'silent' },
}));

const ORGANIZATION = 'org_aaaaaaaaaaaaaaaaaaaa1';
const FILE_KEY = `organization-files/${ORGANIZATION}/photo.jpg`;
const THUMBNAIL_KEY = `organization-files/${ORGANIZATION}/photo.thumb.webp`;

/** The common thumbnail capability of the upload domain (patient photos use it first). */
describe('UploadService thumbnails', () => {
  const storage = createObjectStoragePortMock();
  const service = new UploadService(
    {} as unknown as UploadRepository,
    {} as unknown as UserService,
    {} as unknown as OrganizationService,
    storage,
  );
  let photo: Buffer;

  beforeEach(async () => {
    vi.clearAllMocks();
    photo = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#808080' } })
      .jpeg()
      .toBuffer();
  });

  describe('createThumbnail', () => {
    it('writes a WebP thumbnail next to an opted-in photo of the organization', async () => {
      vi.mocked(storage.getObject).mockResolvedValue({ body: photo, contentType: 'image/jpeg' });
      const result = await service.createThumbnail({
        organizationPublicId: ORGANIZATION,
        fileKey: FILE_KEY,
      });
      expect(result).toEqual({ kind: 'created', thumbnailKey: THUMBNAIL_KEY });
      const put = vi.mocked(storage.putObject).mock.calls[0]?.[0];
      expect(put?.key).toBe(THUMBNAIL_KEY);
      expect(put?.contentType).toBe('image/webp');
      expect((await sharp(put?.body).metadata()).width).toBe(320);
    });

    it.each([
      ['another organization', `organization-files/org_bbbbbbbbbbbbbbbbbbbb2/photo.jpg`],
      ['a purpose without thumbnails', `organization-logos/${ORGANIZATION}/logo.png`],
      ['a user file', 'user-files/user_aaaaaaaaaaaaaaaaaaaa1/photo.jpg'],
      ['a path that climbs out', `organization-files/${ORGANIZATION}/../org_b/photo.jpg`],
      ['a thumbnail itself', THUMBNAIL_KEY],
    ])('skips %s without touching storage', async (_label, fileKey) => {
      const result = await service.createThumbnail({ organizationPublicId: ORGANIZATION, fileKey });
      expect(result).toEqual({ kind: 'skipped', reason: 'not_opted_in' });
      expect(storage.getObject).not.toHaveBeenCalled();
    });

    it('skips a photo whose stored file is gone', async () => {
      vi.mocked(storage.getObject).mockRejectedValue(new Error('NoSuchKey'));
      vi.mocked(storage.headObject).mockResolvedValue(null);
      await expect(
        service.createThumbnail({ organizationPublicId: ORGANIZATION, fileKey: FILE_KEY }),
      ).resolves.toEqual({ kind: 'skipped', reason: 'source_missing' });
      expect(storage.putObject).not.toHaveBeenCalled();
    });

    it('skips a type the purpose does not opt in, and bytes no decoder reads', async () => {
      vi.mocked(storage.getObject).mockResolvedValueOnce({
        body: Buffer.from('%PDF-1.7'),
        contentType: 'application/pdf',
      });
      await expect(
        service.createThumbnail({ organizationPublicId: ORGANIZATION, fileKey: FILE_KEY }),
      ).resolves.toEqual({ kind: 'skipped', reason: 'source_unusable' });
      vi.mocked(storage.getObject).mockResolvedValueOnce({
        body: Buffer.from('corrupt'),
        contentType: 'image/jpeg',
      });
      await expect(
        service.createThumbnail({ organizationPublicId: ORGANIZATION, fileKey: FILE_KEY }),
      ).resolves.toEqual({ kind: 'skipped', reason: 'source_unusable' });
      expect(storage.putObject).not.toHaveBeenCalled();
    });

    it('lets a storage failure through, so the job retries', async () => {
      vi.mocked(storage.getObject).mockRejectedValue(new Error('S3 503'));
      vi.mocked(storage.headObject).mockRejectedValue(new Error('S3 503'));
      await expect(
        service.createThumbnail({ organizationPublicId: ORGANIZATION, fileKey: FILE_KEY }),
      ).rejects.toThrow('S3 503');
    });
  });

  describe('deleteThumbnail', () => {
    it("deletes the organization's thumbnail", async () => {
      vi.mocked(storage.deleteObject).mockResolvedValue({ kind: 'deleted' });
      await service.deleteThumbnail({
        organizationPublicId: ORGANIZATION,
        thumbnailKey: THUMBNAIL_KEY,
      });
      expect(storage.deleteObject).toHaveBeenCalledWith(THUMBNAIL_KEY);
    });

    it('refuses the full photo and another organization’s thumbnail', async () => {
      for (const thumbnailKey of [FILE_KEY, `organization-files/org_b/photo.thumb.webp`]) {
        await expect(
          service.deleteThumbnail({ organizationPublicId: ORGANIZATION, thumbnailKey }),
        ).rejects.toBeInstanceOf(ValidationError);
      }
      expect(storage.deleteObject).not.toHaveBeenCalled();
    });

    it('throws when the store refuses the delete', async () => {
      vi.mocked(storage.deleteObject).mockResolvedValue({ kind: 'failed', circuitOpen: false });
      await expect(
        service.deleteThumbnail({
          organizationPublicId: ORGANIZATION,
          thumbnailKey: THUMBNAIL_KEY,
        }),
      ).rejects.toThrow('upload.thumbnail_delete_failed');
    });
  });

  describe('createThumbnailReadUrls', () => {
    it("signs only the organization's own thumbnails", async () => {
      vi.mocked(storage.createPresignedDownloadUrl).mockResolvedValue('https://signed/thumb');
      const links = await service.createThumbnailReadUrls({
        organizationPublicId: ORGANIZATION,
        thumbnailKeys: [THUMBNAIL_KEY, FILE_KEY, 'organization-files/org_b/x.thumb.webp'],
      });
      expect([...links.entries()]).toEqual([[THUMBNAIL_KEY, 'https://signed/thumb']]);
      expect(storage.createPresignedDownloadUrl).toHaveBeenCalledTimes(1);
    });
  });
});
