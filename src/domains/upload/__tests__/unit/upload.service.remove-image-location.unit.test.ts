import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@/shared/errors/index.js';
import { UploadService } from '@/domains/upload/upload.service.js';
import { UPLOAD_STATUS } from '@/domains/upload/upload.constants.js';
import type { UploadRepository } from '@/domains/upload/upload.repository.js';
import type { UserService } from '@/domains/user/user.service.js';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { AuthorizationService } from '@/domains/tenancy/sub-domains/permission/authorization.service.js';
import { createObjectStoragePortMock } from '@/tests/helpers/object-storage-mock.helper.js';

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    withAppDatabaseContext: vi.fn(async (_scope: unknown, callback: () => Promise<unknown>) =>
      callback(),
    ),
  };
});

vi.mock('@/shared/config/env.config.js', () => ({
  getEnv: vi.fn(() => ({ S3_BUCKET: 'test-bucket', LOG_LEVEL: 'silent' })),
  env: { S3_BUCKET: 'test-bucket', LOG_LEVEL: 'silent' },
}));

const ORGANIZATION_INTERNAL_ID = 10;
const FILE_KEY = 'organizations/org_aaaaaaaaaaaaaaaaaaaa1/uploads/after.jpg';
const SCOPE = { organizationPublicId: 'org_aaaaaaaaaaaaaaaaaaaa1' } as never;

/** A JPEG whose only APP1 is an XMP packet — the part the location removal drops. */
const JPEG_WITH_XMP = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x24]),
  Buffer.from('http://ns.adobe.com/xap/1.0/\0<x/>', 'latin1'),
  Buffer.from([0x00, 0x00, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]),
]);

/** A confirmed upload row of the organization. */
function uploadRow(mimeType: string, organizationId = ORGANIZATION_INTERNAL_ID) {
  return {
    id: 2,
    public_id: 'upload_aaaaaaaaaaaaaaaaaaaa1',
    user_id: 1,
    organization_id: organizationId,
    file_name: 'after.jpg',
    file_key: FILE_KEY,
    mime_type: mimeType,
    file_size: 4096,
    status: UPLOAD_STATUS.UPLOADED,
  };
}

/** The upload domain's half of WC-42 (launch D79): a photo's stored file without its location. */
describe('UploadService.removeImageLocation', () => {
  const findByFileKey = vi.fn();
  const storage = createObjectStoragePortMock();
  const service = new UploadService(
    { findByFileKey } as unknown as UploadRepository,
    {} as unknown as UserService,
    {} as unknown as OrganizationService,
    storage,
    {} as unknown as AuthorizationService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rewrites a JPEG without its XMP, under the same key and type', async () => {
    findByFileKey.mockResolvedValue(uploadRow('image/jpeg'));
    storage.getObject.mockResolvedValue({ body: JPEG_WITH_XMP, contentType: 'image/jpeg' });

    await service.removeImageLocation({
      scope: SCOPE,
      fileKey: FILE_KEY,
      organizationInternalId: ORGANIZATION_INTERNAL_ID,
    });

    expect(storage.putObject).toHaveBeenCalledOnce();
    const written = storage.putObject.mock.calls[0]?.[0];
    expect([written?.key, written?.contentType]).toEqual([FILE_KEY, 'image/jpeg']);
    expect(written?.body.includes(Buffer.from('ns.adobe.com', 'latin1'))).toBe(false);
  });

  it('writes nothing when there is no location, or for a file that is no photo', async () => {
    findByFileKey.mockResolvedValue(uploadRow('image/jpeg'));
    storage.getObject.mockResolvedValue({
      body: Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]),
      contentType: 'image/jpeg',
    });
    await service.removeImageLocation({
      scope: SCOPE,
      fileKey: FILE_KEY,
      organizationInternalId: 10,
    });

    findByFileKey.mockResolvedValue(uploadRow('application/pdf'));
    await service.removeImageLocation({
      scope: SCOPE,
      fileKey: FILE_KEY,
      organizationInternalId: 10,
    });

    expect(storage.putObject).not.toHaveBeenCalled();
    expect(storage.getObject).toHaveBeenCalledOnce();
  });

  it("refuses another organization's upload before touching storage", async () => {
    findByFileKey.mockResolvedValue(uploadRow('image/jpeg', 99));

    await expect(
      service.removeImageLocation({ scope: SCOPE, fileKey: FILE_KEY, organizationInternalId: 10 }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('a storage failure propagates — the photo is never filed with its location', async () => {
    findByFileKey.mockResolvedValue(uploadRow('image/png'));
    storage.getObject.mockRejectedValue(new Error('S3 unavailable'));

    await expect(
      service.removeImageLocation({ scope: SCOPE, fileKey: FILE_KEY, organizationInternalId: 10 }),
    ).rejects.toThrow('S3 unavailable');
    expect(storage.headObject).toHaveBeenCalledWith(FILE_KEY);
  });

  it('a stored file that is gone has no location to remove — nothing written, no error', async () => {
    findByFileKey.mockResolvedValue(uploadRow('image/jpeg'));
    storage.getObject.mockRejectedValue(new Error('NoSuchKey'));
    storage.headObject.mockResolvedValueOnce(null);

    await service.removeImageLocation({
      scope: SCOPE,
      fileKey: FILE_KEY,
      organizationInternalId: ORGANIZATION_INTERNAL_ID,
    });
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('a read failure the HEAD cannot explain still propagates', async () => {
    findByFileKey.mockResolvedValue(uploadRow('image/jpeg'));
    storage.getObject.mockRejectedValue(new Error('S3 unavailable'));
    storage.headObject.mockRejectedValueOnce(new Error('S3 unavailable'));

    await expect(
      service.removeImageLocation({ scope: SCOPE, fileKey: FILE_KEY, organizationInternalId: 10 }),
    ).rejects.toThrow('S3 unavailable');
  });
});
