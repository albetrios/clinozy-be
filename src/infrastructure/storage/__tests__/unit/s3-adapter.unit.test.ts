import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
const getSignedUrlMock = vi.fn().mockResolvedValue('https://signed.example/put');

vi.mock('@/infrastructure/resilience/circuit-breaker.js', () => ({
  s3Circuit: {
    execute: <T>(operation: () => Promise<T>) => operation(),
  },
  // outboundCall references `error instanceof CircuitBreakerOpenError` in its error
  // path; provide a stub so the not-found-vs-transient classification (UPLOAD-03) runs.
  CircuitBreakerOpenError: class CircuitBreakerOpenError extends Error {
    constructor(
      readonly circuitName: string,
      readonly retryAfterMs: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

vi.mock('@aws-sdk/client-s3', () => {
  class PutObjectCommand {
    constructor(public readonly input: unknown) {}
  }
  class HeadObjectCommand {
    constructor(public readonly input: unknown) {}
  }
  class DeleteObjectCommand {
    constructor(public readonly input: unknown) {}
  }
  class GetObjectCommand {
    constructor(public readonly input: unknown) {}
  }
  class CopyObjectCommand {
    constructor(public readonly input: unknown) {}
  }
  return {
    S3Client: vi.fn(function S3ClientMock() {
      return { send: sendMock };
    }),
    PutObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    CopyObjectCommand,
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...arguments_: unknown[]) => getSignedUrlMock(...arguments_),
}));

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    S3_BUCKET: 'test-bucket' as string | undefined,
    S3_REGION: 'eu-west-1',
    S3_MAX_ATTEMPTS: 3,
    LOG_LEVEL: 'silent',
  },
}));
vi.mock('@/shared/config/env.config.js', () => ({
  env: mockEnv,
  getEnv: () => mockEnv,
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { S3ObjectStorageAdapter } from '@/infrastructure/storage/s3-adapter.js';
import { CircuitBreakerOpenError } from '@/infrastructure/resilience/circuit-breaker.js';
import { ConfigurationError } from '@/shared/errors/index.js';

const notFound = (name: 'NotFound' | 'NoSuchKey') =>
  Object.assign(new Error('not found'), { name, $metadata: { httpStatusCode: 404 } });

describe('S3ObjectStorageAdapter', () => {
  let adapter: S3ObjectStorageAdapter;

  beforeEach(() => {
    adapter = new S3ObjectStorageAdapter();
    sendMock.mockReset();
    getSignedUrlMock.mockClear();
    getSignedUrlMock.mockResolvedValue('https://signed.example/put');
  });

  it('createPresignedDownloadUrl returns a signed GET URL', async () => {
    getSignedUrlMock.mockResolvedValueOnce('https://signed.example/get');
    const url = await adapter.createPresignedDownloadUrl({
      key: 'user-data-export/user/exp.json.gz',
      expiresInSeconds: 86_400,
    });
    expect(url).toBe('https://signed.example/get');
    expect(getSignedUrlMock).toHaveBeenCalled();
  });

  it('createPresignedDownloadUrl serves the object inline under its file name when given one', async () => {
    getSignedUrlMock.mockResolvedValueOnce('https://signed.example/get');
    await adapter.createPresignedDownloadUrl({
      key: 'uploads/org/3f1c2b7e.pdf',
      expiresInSeconds: 900,
      fileName: 'CBC report.pdf',
    });
    const [, command, signingOptions] = getSignedUrlMock.mock.calls.at(-1) as [
      unknown,
      { input: { ResponseContentDisposition?: string } },
      { expiresIn?: number },
    ];
    expect(command.input.ResponseContentDisposition).toBe(
      `inline; filename="CBC report.pdf"; filename*=UTF-8''CBC%20report.pdf`,
    );
    expect(signingOptions.expiresIn).toBe(900);
  });

  it('createPresignedDownloadUrl leaves the disposition to the store without a file name', async () => {
    getSignedUrlMock.mockResolvedValueOnce('https://signed.example/get');
    await adapter.createPresignedDownloadUrl({
      key: 'user-data-export/u/e.json.gz',
      expiresInSeconds: 60,
    });
    const [, command] = getSignedUrlMock.mock.calls.at(-1) as [
      unknown,
      { input: { ResponseContentDisposition?: string } },
    ];
    expect(command.input.ResponseContentDisposition).toBeUndefined();
  });

  it('createPresignedUploadUrl returns a signed PUT URL bound to an exact Content-Length', async () => {
    const url = await adapter.createPresignedUploadUrl({
      key: 'uploads/file.png',
      contentType: 'image/png',
      contentLength: 1024,
      expiresInSeconds: 900,
    });

    expect(url).toBe('https://signed.example/put');
    expect(getSignedUrlMock).toHaveBeenCalledOnce();

    const [, command, signingOptions] = getSignedUrlMock.mock.calls[0] as [
      unknown,
      { input: { ContentLength?: number } },
      { signableHeaders?: Set<string> },
    ];
    // The signed command binds Content-Length so S3 rejects an oversized body.
    expect(command.input.ContentLength).toBe(1024);
    expect(signingOptions.signableHeaders).toBeInstanceOf(Set);
    expect([...(signingOptions.signableHeaders ?? [])]).toContain('content-length');
  });

  // sec-U11: server-side writes (worker putObject, copyObject) must request
  // SSE-S3 (`AES256`) on every command so a misconfigured bucket (no default
  // SSE) cannot silently land plaintext audit / data-export bundles in S3.
  // The bucket policy is a defence in depth — not the only protection.
  it('putObject sets ServerSideEncryption: AES256 on the underlying PutObjectCommand (sec-U11)', async () => {
    sendMock.mockResolvedValueOnce({});

    await adapter.putObject({
      key: 'audit/export.ndjson.gz',
      body: Buffer.from('test'),
      contentType: 'application/x-ndjson',
    });

    expect(sendMock).toHaveBeenCalledOnce();
    const [putCommand] = sendMock.mock.calls[0] as [{ input: { ServerSideEncryption?: string } }];
    expect(putCommand.input.ServerSideEncryption).toBe('AES256');
  });

  it('copyObject sets ServerSideEncryption: AES256 on the underlying CopyObjectCommand (sec-U11)', async () => {
    sendMock.mockResolvedValueOnce({});

    await adapter.copyObject({
      sourceKey: 'pending/avatars/u1.png',
      destinationKey: 'avatars/u1.png',
      contentType: 'image/png',
    });

    expect(sendMock).toHaveBeenCalledOnce();
    const [copyCommand] = sendMock.mock.calls[0] as [{ input: { ServerSideEncryption?: string } }];
    expect(copyCommand.input.ServerSideEncryption).toBe('AES256');
  });

  it('headObject maps S3 metadata to port shape', async () => {
    sendMock.mockResolvedValueOnce({
      ContentType: 'image/png',
      ContentLength: 2048,
    });

    const metadata = await adapter.headObject('uploads/file.png');

    expect(metadata).toEqual({ contentType: 'image/png', contentLength: 2048 });
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it('UPLOAD-03: headObject returns null for a genuine NotFound (404)', async () => {
    sendMock.mockRejectedValueOnce(notFound('NotFound'));

    const metadata = await adapter.headObject('uploads/missing.png');

    expect(metadata).toBeNull();
  });

  it('UPLOAD-03: headObject rethrows a transient failure instead of returning null', async () => {
    sendMock.mockRejectedValueOnce(new Error('connection reset by peer'));

    await expect(adapter.headObject('uploads/file.png')).rejects.toBeTruthy();
  });

  it('UPLOAD-03: getObjectFirstBytes rethrows a transient failure instead of returning null', async () => {
    sendMock.mockRejectedValueOnce(new Error('ETIMEDOUT'));

    await expect(
      adapter.getObjectFirstBytes({ key: 'uploads/file.png', byteCount: 16 }),
    ).rejects.toBeTruthy();
  });

  it('UPLOAD-03: getObjectFirstBytes returns null for a genuine NoSuchKey (404)', async () => {
    sendMock.mockRejectedValueOnce(notFound('NoSuchKey'));

    const result = await adapter.getObjectFirstBytes({ key: 'uploads/missing.png', byteCount: 16 });

    expect(result).toBeNull();
  });

  it('deleteObject reports a deleted object', async () => {
    sendMock.mockResolvedValueOnce({});

    expect(await adapter.deleteObject('uploads/file.png')).toEqual({ kind: 'deleted' });
  });

  it('deleteObject reports a failed delete without throwing', async () => {
    sendMock.mockRejectedValueOnce(new Error('access denied'));

    expect(await adapter.deleteObject('uploads/missing.png')).toEqual({
      kind: 'failed',
      circuitOpen: false,
    });
  });

  it('deleteObject says when the circuit is open, so a batch can stop', async () => {
    sendMock.mockRejectedValueOnce(new CircuitBreakerOpenError('s3', 1_000, 'open'));

    expect(await adapter.deleteObject('uploads/file.png')).toEqual({
      kind: 'failed',
      circuitOpen: true,
    });
  });

  it('getObjectFirstBytes returns the bytes with the ETag the copy is pinned to', async () => {
    sendMock.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([0x89, 0x50]) },
      ContentType: 'image/png',
      ETag: '"etag-1"',
    });

    const result = await adapter.getObjectFirstBytes({ key: 'pending/file.png', byteCount: 32 });

    expect(result).toEqual({
      body: Buffer.from([0x89, 0x50]),
      contentType: 'image/png',
      eTag: '"etag-1"',
    });
  });

  it('getObjectFirstBytes fails closed on a response without an ETag', async () => {
    sendMock.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([0x89, 0x50]) },
      ContentType: 'image/png',
    });

    await expect(
      adapter.getObjectFirstBytes({ key: 'pending/file.png', byteCount: 32 }),
    ).rejects.toBeTruthy();
  });

  describe('verifyUploadedObject', () => {
    const expected = { contentType: 'image/png', contentLength: 2048 };

    it('verifies an object matching the declared length and type', async () => {
      sendMock.mockResolvedValueOnce({ ContentType: 'image/png', ContentLength: 2048 });

      expect(await adapter.verifyUploadedObject({ key: 'pending/file.png', expected })).toEqual({
        kind: 'verified',
        metadata: { contentType: 'image/png', contentLength: 2048 },
      });
    });

    it('verifies when S3 echoes no content type', async () => {
      sendMock.mockResolvedValueOnce({ ContentLength: 2048 });

      expect(
        await adapter.verifyUploadedObject({ key: 'pending/file.png', expected }),
      ).toMatchObject({
        kind: 'verified',
      });
    });

    it.each([
      ['not_found', () => Promise.reject(notFound('NotFound'))],
      ['content_length_unknown', () => Promise.resolve({ ContentType: 'image/png' })],
      [
        'content_length_mismatch',
        () => Promise.resolve({ ContentType: 'image/png', ContentLength: 10 }),
      ],
      [
        'content_type_mismatch',
        () => Promise.resolve({ ContentType: 'text/html', ContentLength: 2048 }),
      ],
    ])('rejects with reason %s', async (reason, response) => {
      sendMock.mockImplementationOnce(response);

      expect(await adapter.verifyUploadedObject({ key: 'pending/file.png', expected })).toEqual({
        kind: 'rejected',
        reason,
      });
    });

    it('throws on a storage failure — never a verdict on the object', async () => {
      sendMock.mockRejectedValueOnce(new Error('connection reset by peer'));

      await expect(
        adapter.verifyUploadedObject({ key: 'pending/file.png', expected }),
      ).rejects.toBeTruthy();
    });
  });

  it('refuses every call with a ConfigurationError when S3_BUCKET is unset', async () => {
    mockEnv.S3_BUCKET = undefined;
    try {
      await expect(adapter.headObject('uploads/file.png')).rejects.toBeInstanceOf(
        ConfigurationError,
      );
    } finally {
      mockEnv.S3_BUCKET = 'test-bucket';
    }
  });

  it('copyObject issues a server-side copy that replaces the content-type', async () => {
    sendMock.mockResolvedValueOnce({});

    await adapter.copyObject({
      sourceKey: 'pending/avatars/u/x.png',
      destinationKey: 'avatars/u/x.png',
      contentType: 'image/png',
    });

    expect(sendMock).toHaveBeenCalledOnce();
    const command = sendMock.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      Bucket: 'test-bucket',
      CopySource: 'test-bucket/pending/avatars/u/x.png',
      Key: 'avatars/u/x.png',
      ContentType: 'image/png',
      MetadataDirective: 'REPLACE',
    });
  });

  it('copyObject reports the copy done', async () => {
    sendMock.mockResolvedValueOnce({});

    await expect(
      adapter.copyObject({
        sourceKey: 'pending/avatars/u/x.png',
        destinationKey: 'avatars/u/x.png',
        contentType: 'image/png',
        sourceETag: '"verified-etag"',
      }),
    ).resolves.toEqual({ kind: 'copied' });
    const command = sendMock.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({ CopySourceIfMatch: '"verified-etag"' });
  });

  it('copyObject reports source_changed when S3 refuses the ETag-pinned copy (412) — not a storage failure', async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error('At least one of the pre-conditions you specified did not hold'), {
        name: 'PreconditionFailed',
        $metadata: { httpStatusCode: 412 },
      }),
    );

    await expect(
      adapter.copyObject({
        sourceKey: 'pending/avatars/u/x.png',
        destinationKey: 'avatars/u/x.png',
        contentType: 'image/png',
        sourceETag: '"verified-etag"',
      }),
    ).resolves.toEqual({ kind: 'source_changed' });
  });

  it('copyObject still throws a storage failure', async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error('Service Unavailable'), {
        name: 'ServiceUnavailable',
        $metadata: { httpStatusCode: 503 },
      }),
    );

    await expect(
      adapter.copyObject({
        sourceKey: 'pending/avatars/u/x.png',
        destinationKey: 'avatars/u/x.png',
        contentType: 'image/png',
        sourceETag: '"verified-etag"',
      }),
    ).rejects.toBeDefined();
  });
});
