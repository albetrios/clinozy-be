import { describe, it, expect } from 'vitest';
import {
  countsS3ErrorAsCircuitFailure,
  isS3NotFoundError,
  isS3PreconditionFailedError,
} from '@/infrastructure/storage/s3-error.util.js';
import { ExternalServiceError } from '@/infrastructure/outbound/index.js';

/**
 * audit-#5: only an explicit S3 not-found may drive destructive cleanup. These tests pin the
 * boundary between "object truly absent" (true) and "transient outage" (false), including the
 * `outboundCall` wrapping that buries the AWS SDK error on `ExternalServiceError.cause`.
 */
describe('isS3NotFoundError', () => {
  it('detects raw AWS not-found signatures', () => {
    expect(isS3NotFoundError({ name: 'NotFound' })).toBe(true);
    expect(isS3NotFoundError({ name: 'NoSuchKey' })).toBe(true);
    expect(isS3NotFoundError({ Code: 'NoSuchKey' })).toBe(true);
    expect(isS3NotFoundError({ $metadata: { httpStatusCode: 404 } })).toBe(true);
  });

  it('unwraps an ExternalServiceError to find the not-found cause', () => {
    const wrapped = new ExternalServiceError({
      integration: 's3',
      category: 'unknown',
      cause: { name: 'NotFound', $metadata: { httpStatusCode: 404 } },
    });
    expect(isS3NotFoundError(wrapped)).toBe(true);
  });

  it('returns false for transient failures (timeout / throttle / circuit-open / 5xx)', () => {
    expect(isS3NotFoundError(new Error('socket hang up'))).toBe(false);
    expect(isS3NotFoundError({ name: 'TimeoutError' })).toBe(false);
    expect(isS3NotFoundError({ $metadata: { httpStatusCode: 503 } })).toBe(false);
    expect(
      isS3NotFoundError(
        new ExternalServiceError({
          integration: 's3',
          category: 'timeout',
          cause: { name: 'TimeoutError' },
        }),
      ),
    ).toBe(false);
  });

  it('returns false for non-object values', () => {
    expect(isS3NotFoundError(null)).toBe(false);
    expect(isS3NotFoundError(undefined)).toBe(false);
    expect(isS3NotFoundError('NotFound')).toBe(false);
  });
});

describe('isS3PreconditionFailedError', () => {
  it('detects S3 refusing a conditional copy, raw or wrapped by outboundCall', () => {
    const sdkError = { name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } };
    expect(isS3PreconditionFailedError(sdkError)).toBe(true);
    expect(isS3PreconditionFailedError({ Code: 'PreconditionFailed' })).toBe(true);
    expect(isS3PreconditionFailedError({ $metadata: { httpStatusCode: 412 } })).toBe(true);
    expect(
      isS3PreconditionFailedError(
        new ExternalServiceError({ integration: 's3', category: 'unknown', cause: sdkError }),
      ),
    ).toBe(true);
  });

  it('returns false for not-found, outages and non-object values', () => {
    expect(
      isS3PreconditionFailedError({ name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } }),
    ).toBe(false);
    expect(isS3PreconditionFailedError({ $metadata: { httpStatusCode: 503 } })).toBe(false);
    expect(isS3PreconditionFailedError('PreconditionFailed')).toBe(false);
    expect(isS3PreconditionFailedError(null)).toBe(false);
  });
});

describe('countsS3ErrorAsCircuitFailure', () => {
  const s3Error = (name: string, httpStatusCode: number) => ({
    name,
    $metadata: { httpStatusCode },
  });

  it('does not count S3 refusing one request: missing key, failed precondition, bad range', () => {
    expect(countsS3ErrorAsCircuitFailure(s3Error('NotFound', 404))).toBe(false);
    expect(countsS3ErrorAsCircuitFailure(s3Error('NoSuchKey', 404))).toBe(false);
    expect(countsS3ErrorAsCircuitFailure(s3Error('PreconditionFailed', 412))).toBe(false);
    expect(countsS3ErrorAsCircuitFailure(s3Error('InvalidRange', 416))).toBe(false);
    expect(countsS3ErrorAsCircuitFailure(s3Error('EntityTooLarge', 400))).toBe(false);
  });

  it('counts outages, timeouts and errors without an HTTP status', () => {
    expect(countsS3ErrorAsCircuitFailure(s3Error('InternalError', 500))).toBe(true);
    expect(countsS3ErrorAsCircuitFailure(s3Error('ServiceUnavailable', 503))).toBe(true);
    expect(countsS3ErrorAsCircuitFailure(new Error('socket hang up'))).toBe(true);
    expect(countsS3ErrorAsCircuitFailure({ name: 'TimeoutError' })).toBe(true);
    expect(countsS3ErrorAsCircuitFailure('not an error object')).toBe(true);
  });

  it('counts a 4xx every other call would hit too: denied, throttled, bad credentials, no bucket', () => {
    expect(countsS3ErrorAsCircuitFailure(s3Error('AccessDenied', 403))).toBe(true);
    expect(countsS3ErrorAsCircuitFailure(s3Error('SlowDown', 429))).toBe(true);
    expect(countsS3ErrorAsCircuitFailure(s3Error('RequestTimeout', 400))).toBe(true);
    expect(countsS3ErrorAsCircuitFailure(s3Error('ExpiredToken', 400))).toBe(true);
    expect(countsS3ErrorAsCircuitFailure(s3Error('NoSuchBucket', 404))).toBe(true);
  });
});
