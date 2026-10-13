import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { env } from '@/shared/config/env.config.js';
import { outboundCall } from '@/infrastructure/outbound/index.js';
import { CircuitBreakerOpenError } from '@/infrastructure/resilience/circuit-breaker.js';
import { ConfigurationError } from '@/shared/errors/index.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  type S3HeadResult,
  isS3NotFoundError,
  isS3PreconditionFailedError,
} from '@/infrastructure/storage/s3-error.util.js';
import { buildSharedS3ClientConfig } from '@/infrastructure/storage/s3-client-config.util.js';
import { inlineContentDisposition } from '@/infrastructure/storage/content-disposition.util.js';
import type { UploadBucketCorsRule } from '@/infrastructure/storage/bucket-cors.util.js';
import type {
  ObjectCopyResult,
  ObjectDeleteResult,
  ObjectStoragePort,
  PresignedUploadPost,
  PresignedUploadPut,
  UploadedObjectMetadata,
  UploadedObjectVerdict,
} from '@/infrastructure/storage/object-storage.port.js';

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  s3Client = new S3Client({
    ...buildSharedS3ClientConfig(),
    // Bound each attempt so a stalled S3 endpoint can't hang a request/worker indefinitely. Without
    // an explicit handler the AWS SDK uses Node's default (effectively unbounded socket) timeout.
    requestHandler: {
      requestTimeout: env.S3_REQUEST_TIMEOUT_MS,
      connectionTimeout: env.S3_CONNECTION_TIMEOUT_MS,
    },
  });

  return s3Client;
}

function requireBucket(): string {
  const bucket = env.S3_BUCKET;
  if (!bucket) throw new ConfigurationError('S3_BUCKET is not configured');
  return bucket;
}

/** Default S3 implementation of {@link ObjectStoragePort}. */
export class S3ObjectStorageAdapter implements ObjectStoragePort {
  /**
   * Presigned PUT URL bound to an exact `Content-Length`. `content-length` is forced into
   * the SigV4 signed headers so S3 rejects any request whose body length differs from the
   * value declared (and validated `<= UPLOAD_PURPOSE_CONFIG.maxSize`) at create time — this
   * is the strongest size constraint a presigned PUT supports. For an explicit min/max range
   * prefer the presigned POST flow (`UPLOAD_USE_PRESIGNED_POST=true`, recommended for
   * production); see {@link createPresignedUploadPost}.
   *
   * Returns the `headers` the PUT must carry with the URL: `content-type` and the SSE header are
   * signed, so a client that sent only `Content-Type` was refused with `SignatureDoesNotMatch`.
   * Every name here must be in the bucket's CORS `AllowedHeaders` (`UPLOAD_BUCKET_CORS_ALLOWED_HEADERS`).
   */
  async createPresignedUploadUrl(options: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<PresignedUploadPut> {
    const bucket = requireBucket();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: options.key,
      ContentType: options.contentType,
      ContentLength: options.contentLength,
      // sec-r4-E1: require SSE-S3 on the uploaded object. The bucket default
      // is defence-in-depth; binding the requirement into the presigned URL
      // also forces the client to send `x-amz-server-side-encryption: AES256`,
      // so a misconfigured bucket cannot accept an unencrypted upload via
      // this presigned URL.
      ServerSideEncryption: 'AES256',
    });

    const url = await getSignedUrl(getS3Client(), command, {
      expiresIn: options.expiresInSeconds,
      // sec-r4-E1: include the SSE header in the signed-headers set so the
      // signature is invalidated if the client strips or rewrites it.
      signableHeaders: new Set([
        'content-length',
        'content-type',
        'host',
        'x-amz-server-side-encryption',
      ]),
    });
    return {
      url,
      headers: {
        'content-type': options.contentType,
        'x-amz-server-side-encryption': 'AES256',
      },
    };
  }

  async createPresignedUploadPost(options: {
    key: string;
    contentType: string;
    minContentLength: number;
    maxContentLength: number;
    expiresInSeconds: number;
    metadata?: Record<string, string>;
  }): Promise<PresignedUploadPost> {
    const bucket = requireBucket();
    const metadataConditions = Object.entries(options.metadata ?? {}).map(
      ([metadataKey, value]) => ({ [`x-amz-meta-${metadataKey}`]: value }),
    );
    const { url, fields } = await createPresignedPost(getS3Client(), {
      Bucket: bucket,
      Key: options.key,
      Conditions: [
        ['content-length-range', options.minContentLength, options.maxContentLength],
        ['eq', '$Content-Type', options.contentType],
        // sec-r4-E1: enforce AES256 server-side encryption on the uploaded
        // object via a POST policy condition so the browser form must include
        // the header and S3 rejects anything else.
        ['eq', '$x-amz-server-side-encryption', 'AES256'],
        ...metadataConditions,
      ],
      Fields: {
        'Content-Type': options.contentType,
        // sec-r4-E1: pre-populate the SSE field so a vanilla form upload
        // satisfies the condition above without the client having to add it.
        'x-amz-server-side-encryption': 'AES256',
        ...Object.fromEntries(
          Object.entries(options.metadata ?? {}).map(([metadataKey, value]) => [
            `x-amz-meta-${metadataKey}`,
            value,
          ]),
        ),
      },
      Expires: options.expiresInSeconds,
    });
    return { url, fields };
  }

  async verifyUploadedObject({
    key,
    expected,
  }: {
    key: string;
    expected: { contentType: string; contentLength: number };
  }): Promise<UploadedObjectVerdict> {
    const head = await this.headObjectResult(key);
    // audit-#5: a storage failure is not a verdict on the object. Rethrow what the call threw (an
    // ExternalServiceError, or the CircuitBreakerOpenError of an open circuit) so the confirm path
    // leaves the upload PENDING instead of marking a perfectly valid object FAILED.
    if (head.kind === 'transient_error') {
      throw head.cause;
    }
    if (head.kind === 'not_found') {
      return { kind: 'rejected', reason: 'not_found' };
    }
    const { metadata } = head;
    if (metadata.contentLength === undefined) {
      return { kind: 'rejected', reason: 'content_length_unknown' };
    }
    if (metadata.contentLength !== expected.contentLength) {
      return { kind: 'rejected', reason: 'content_length_mismatch' };
    }
    // S3 may not echo a content type; only a reported one can mismatch.
    if (metadata.contentType !== undefined && metadata.contentType !== expected.contentType) {
      return { kind: 'rejected', reason: 'content_type_mismatch' };
    }
    return { kind: 'verified', metadata };
  }

  async createPresignedDownloadUrl(options: {
    key: string;
    expiresInSeconds: number;
    fileName?: string;
  }): Promise<string> {
    const bucket = requireBucket();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: options.key,
      ...(options.fileName === undefined
        ? {}
        : { ResponseContentDisposition: inlineContentDisposition(options.fileName) }),
    });
    return getSignedUrl(getS3Client(), command, { expiresIn: options.expiresInSeconds });
  }

  /**
   * Discriminated `HeadObject` (audit-#5): distinguishes `found` / `not_found` /
   * `transient_error` so callers never treat an outage as object absence. Only an explicit
   * `NoSuchKey`/404 maps to `not_found`; every other failure (timeout, throttle, circuit-open,
   * IAM denial, 5xx) is a `transient_error` carrying the original cause for the caller to retry.
   */
  async headObjectResult(key: string): Promise<S3HeadResult<UploadedObjectMetadata>> {
    const bucket = requireBucket();
    try {
      const metadata = await outboundCall({
        name: 's3',
        operation: async (signal) => {
          const response = await getS3Client().send(
            new HeadObjectCommand({ Bucket: bucket, Key: key }),
            { abortSignal: signal },
          );
          return {
            contentType: response.ContentType,
            contentLength: response.ContentLength,
          };
        },
      });
      return { kind: 'found', metadata };
    } catch (error) {
      if (isS3NotFoundError(error)) {
        return { kind: 'not_found' };
      }
      logger.error({ error, key, bucket }, 's3.headObject.transient');
      return { kind: 'transient_error', cause: error };
    }
  }

  async headObject(key: string): Promise<UploadedObjectMetadata | null> {
    const result = await this.headObjectResult(key);
    if (result.kind === 'transient_error') throw result.cause;
    return result.kind === 'found' ? result.metadata : null;
  }

  async getObject(key: string): Promise<{ body: Buffer; contentType: string | undefined }> {
    const bucket = requireBucket();

    return outboundCall({
      name: 's3',
      operation: async (signal) => {
        const response = await getS3Client().send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
          { abortSignal: signal },
        );

        const body = await response.Body?.transformToByteArray();
        if (!body) {
          throw new Error('upload object body empty');
        }

        return {
          body: Buffer.from(body),
          contentType: response.ContentType,
        };
      },
    });
  }

  async getObjectFirstBytes({ key, byteCount }: { key: string; byteCount: number }): Promise<{
    body: Buffer;
    contentType: string | undefined;
    /**
     * S3 object ETag at the time the bytes were read. sec-re-10: the caller threads this back
     * into {@link copyObject} as `CopySourceIfMatch` so S3 rejects the COPY with
     * `PreconditionFailed` when the presigned PUT/POST is replayed between the verify and the
     * copy, replacing the verified bytes with hostile content.
     */
    eTag: string;
  } | null> {
    const bucket = requireBucket();
    try {
      return await outboundCall({
        name: 's3',
        operation: async (signal) => {
          const response = await getS3Client().send(
            new GetObjectCommand({
              Bucket: bucket,
              Key: key,
              Range: `bytes=0-${byteCount - 1}`,
            }),
            { abortSignal: signal },
          );
          const body = await response.Body?.transformToByteArray();
          if (!body) {
            throw new Error('upload object body empty');
          }
          // Without the ETag the copy cannot be pinned to the verified bytes: fail closed.
          if (!response.ETag) {
            throw new Error('upload object read returned no ETag');
          }
          return {
            body: Buffer.from(body),
            contentType: response.ContentType,
            eTag: response.ETag,
          };
        },
      });
    } catch (error) {
      if (isS3NotFoundError(error)) {
        logger.warn({ key, bucket }, 's3.getObjectFirstBytes.not_found');
        return null;
      }
      logger.error({ error, key, bucket }, 's3.getObjectFirstBytes.transient_failure');
      throw error;
    }
  }

  async putObject(options: {
    key: string;
    body: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    const bucket = requireBucket();
    await outboundCall({
      name: 's3',
      operation: async (signal) => {
        await getS3Client().send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: options.key,
            Body: options.body,
            ContentType: options.contentType,
            Metadata: options.metadata,
            // sec-U11: explicit SSE-S3 request — bucket default encryption is
            // a defence in depth; explicit at the call site protects against
            // misconfigured buckets that lack a default and would otherwise
            // store payloads (avatars, uploads, audit copies) unencrypted.
            ServerSideEncryption: 'AES256',
          }),
          { abortSignal: signal },
        );
      },
    });
  }

  async copyObject(options: {
    sourceKey: string;
    destinationKey: string;
    contentType: string;
    /**
     * Optional S3 ETag from the source object. sec-re-10: when supplied,
     * passed to S3 as `CopySourceIfMatch` so the COPY fails with
     * `PreconditionFailed` if the source bytes changed since the caller
     * inspected them — closing the TOCTOU window between the magic-byte
     * verify on `pending/<key>` and the copy to the servable key for the
     * ~15 minutes the presigned PUT remains replayable.
     */
    sourceETag?: string;
  }): Promise<ObjectCopyResult> {
    const bucket = requireBucket();
    try {
      await outboundCall({
        name: 's3',
        operation: async (signal) => {
          await getS3Client().send(
            new CopyObjectCommand({
              Bucket: bucket,
              // CopySource is `<bucket>/<key>`; our keys use only URL-safe path characters.
              CopySource: `${bucket}/${options.sourceKey}`,
              Key: options.destinationKey,
              ContentType: options.contentType,
              MetadataDirective: 'REPLACE',
              // sec-U11: explicit SSE-S3 on the destination object so a copy
              // does not bypass the encryption requirement if the bucket
              // default is misconfigured.
              ServerSideEncryption: 'AES256',
              ...(options.sourceETag ? { CopySourceIfMatch: options.sourceETag } : {}),
            }),
            { abortSignal: signal },
          );
        },
      });
      return { kind: 'copied' };
    } catch (error) {
      // S3 answered 412 to `CopySourceIfMatch`: the source was written again since its ETag was
      // read. That is the caller's race to handle, not a storage outage (and not a circuit
      // failure — `countsS3ErrorAsCircuitFailure` skips a 412).
      if (options.sourceETag !== undefined && isS3PreconditionFailedError(error)) {
        return { kind: 'source_changed' };
      }
      throw error;
    }
  }

  async deleteObject(key: string): Promise<ObjectDeleteResult> {
    const bucket = requireBucket();

    try {
      await outboundCall({
        name: 's3',
        operation: async (signal) => {
          await getS3Client().send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: key,
            }),
            { abortSignal: signal },
          );
        },
      });
      return { kind: 'deleted' };
    } catch (error) {
      logger.error({ error, key, bucket }, 's3.deleteObject.failed');
      return { kind: 'failed', circuitOpen: error instanceof CircuitBreakerOpenError };
    }
  }
}

let defaultAdapter: S3ObjectStorageAdapter | null = null;

/**
 * Returns the process-wide {@link S3ObjectStorageAdapter} singleton (instantiated on
 * first call). DI containers should depend on {@link ObjectStoragePort} and accept this
 * factory as the production binding; tests can supply a fake port instead.
 */
export function getDefaultS3ObjectStorageAdapter(): S3ObjectStorageAdapter {
  defaultAdapter ??= new S3ObjectStorageAdapter();
  return defaultAdapter;
}

/**
 * Replaces the upload bucket's CORS configuration with `rules` (`PutBucketCors`).
 *
 * @remarks
 * Operator-only — `pnpm ops:storage:cors --apply` is the one caller. It needs `s3:PutBucketCORS`,
 * which the app's own credentials do not (and should not) hold, so it is not part of
 * {@link ObjectStoragePort}. It replaces every existing rule. It calls the client directly rather
 * than through `outboundCall`: a one-off operator write must not count toward the app's `s3`
 * circuit, and the circuit's Redis connection would keep the command from exiting. The client's
 * own request timeouts still bound it.
 */
export async function putUploadBucketCorsRules(
  rules: readonly UploadBucketCorsRule[],
): Promise<void> {
  await getS3Client().send(
    new PutBucketCorsCommand({
      Bucket: requireBucket(),
      CORSConfiguration: { CORSRules: [...rules] },
    }),
  );
}
