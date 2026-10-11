import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { getDefaultS3ObjectStorageAdapter } from '@/infrastructure/storage/s3-adapter.js';
import { registerThirdPartyContractTestIsolationHooks } from './helpers/register-contract-test-hooks.js';

registerThirdPartyContractTestIsolationHooks();

/**
 * Live check against the configured (non-production) S3 bucket (`pnpm test:contract:live`): the
 * upload path our upload domain drives — a presigned POST the browser submits, verify, ranged
 * read, publish copy, presigned download — through `ObjectStoragePort`, under
 * `contract-live/<run id>/`, deleted afterwards.
 */
describe('S3 object storage (live)', () => {
  const storage = getDefaultS3ObjectStorageAdapter();
  const prefix = `contract-live/${randomUUID()}`;
  const pendingKey = `${prefix}/pending.txt`;
  const finalKey = `${prefix}/final.txt`;
  const body = Buffer.from('contract live check\n');

  afterAll(async () => {
    await storage.deleteObject(pendingKey);
    await storage.deleteObject(finalKey);
  });

  it('uploads through a presigned POST, verifies, copies, serves and deletes the object', async () => {
    const post = await storage.createPresignedUploadPost({
      key: pendingKey,
      contentType: 'text/plain',
      minContentLength: 1,
      maxContentLength: 1024,
      expiresInSeconds: 300,
    });
    const form = new FormData();
    for (const [name, value] of Object.entries(post.fields)) form.append(name, value);
    form.append('file', new Blob([body], { type: 'text/plain' }), 'pending.txt');
    const upload = await fetch(post.url, { method: 'POST', body: form });
    expect(upload.status, await upload.text()).toBe(204);

    expect(
      await storage.verifyUploadedObject({
        key: pendingKey,
        expected: {
          contentType: 'text/plain',
          contentLength: body.length,
        },
      }),
    ).toMatchObject({ kind: 'verified' });
    const head = await storage.getObjectFirstBytes({ key: pendingKey, byteCount: 8 });
    expect(head?.body.toString()).toBe('contract');

    expect(
      await storage.copyObject({
        sourceKey: pendingKey,
        destinationKey: finalKey,
        contentType: 'text/plain',
        sourceETag: head!.eTag,
      }),
    ).toEqual({ kind: 'copied' });
    const download = await fetch(
      await storage.createPresignedDownloadUrl({ key: finalKey, expiresInSeconds: 60 }),
    );
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(body);

    expect(await storage.deleteObject(pendingKey)).toEqual({ kind: 'deleted' });
    expect(await storage.deleteObject(finalKey)).toEqual({ kind: 'deleted' });
    expect(await storage.headObject(finalKey)).toBeNull();
  });
});
