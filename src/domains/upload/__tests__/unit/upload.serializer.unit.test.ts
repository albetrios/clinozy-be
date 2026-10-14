import { describe, it, expect } from 'vitest';
import { serializeUploadCreate } from '@/domains/upload/upload.serializer.js';

describe('serializeUploadCreate', () => {
  it('maps presign response fields', () => {
    const expiresAt = new Date('2026-05-16T12:00:00.000Z');
    expect(
      serializeUploadCreate({
        id: 'abc123xyz',
        upload_url: 'https://s3.example.com/presigned',
        key: 'avatars/user/abc.png',
        expires_at: expiresAt,
        upload_method: 'PUT',
      }),
    ).toEqual({
      id: 'abc123xyz',
      upload_url: 'https://s3.example.com/presigned',
      key: 'avatars/user/abc.png',
      expires_at: expiresAt.toISOString(),
      upload_method: 'PUT',
    });
  });

  it('carries a PUT upload’s signed headers and a POST upload’s form fields', () => {
    const expiresAt = new Date('2026-05-16T12:00:00.000Z');
    const base = {
      id: 'abc123xyz',
      upload_url: 'https://s3.example.com/presigned',
      key: 'avatars/user/abc.png',
      expires_at: expiresAt,
    };
    expect(
      serializeUploadCreate({
        ...base,
        upload_method: 'PUT',
        headers: { 'content-type': 'image/png', 'x-amz-server-side-encryption': 'AES256' },
      }),
    ).toMatchObject({
      upload_method: 'PUT',
      headers: { 'content-type': 'image/png', 'x-amz-server-side-encryption': 'AES256' },
    });
    expect(
      serializeUploadCreate({ ...base, upload_method: 'POST', fields: { key: 'k' } }),
    ).toMatchObject({ upload_method: 'POST', fields: { key: 'k' } });
  });
});
