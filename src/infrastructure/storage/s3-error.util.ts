import { ExternalServiceError } from '@/infrastructure/outbound/outbound-error.js';

/**
 * Discriminated result of an S3 `HeadObject` call (audit-#5).
 *
 * @remarks
 * The previous wrappers collapsed every failure to `null`, conflating an explicit
 * `NoSuchKey`/404 with a timeout, throttle, circuit-open, or IAM denial. Callers then made
 * irreversible decisions (mark an upload `FAILED`, hard-delete an orphan row) on what was
 * really a transient outage. This result forces callers to branch on the real cause so only
 * an explicit not-found can drive destructive cleanup.
 */
export type S3HeadResult<TMetadata> =
  | { kind: 'found'; metadata: TMetadata }
  | { kind: 'not_found' }
  | { kind: 'transient_error'; cause: unknown };

/**
 * True only when `error` is an explicit S3 "object does not exist" response (`NotFound` /
 * `NoSuchKey` / HTTP 404), unwrapping an {@link ExternalServiceError} produced by `outboundCall`
 * to inspect the original AWS SDK error on `cause`.
 *
 * @remarks
 * - **Algorithm:** checks the error and (when wrapped) its `cause` for the AWS SDK not-found
 *   signatures: `name`/`Code` of `NotFound`/`NoSuchKey`, or `$metadata.httpStatusCode === 404`.
 * - **Failure modes:** returns `false` for any non-object value and for every transient signature
 *   (timeout, network, circuit-open, throttling, 5xx) so those are never treated as not-found.
 */
export function isS3NotFoundError(error: unknown): boolean {
  const candidates: unknown[] = [error];
  if (error instanceof ExternalServiceError && error.cause !== undefined) {
    candidates.push(error.cause);
  }
  return candidates.some(matchesS3NotFoundSignature);
}

function matchesS3NotFoundSignature(candidate: unknown): boolean {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }
  const error = candidate as {
    name?: unknown;
    Code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    error.name === 'NotFound' ||
    error.name === 'NoSuchKey' ||
    error.Code === 'NotFound' ||
    error.Code === 'NoSuchKey' ||
    error.$metadata?.httpStatusCode === 404
  );
}

/**
 * S3 error codes that a 4xx answer carries when the problem is the deployment, not the request:
 * every other call would fail the same way, so they count against the circuit.
 */
const S3_SYSTEMIC_CLIENT_ERROR_NAMES = new Set([
  'AccessDenied',
  'AccountProblem',
  'AllAccessDisabled',
  'ExpiredToken',
  'InvalidAccessKeyId',
  'InvalidToken',
  'NoSuchBucket',
  'RequestTimeTooSkewed',
  'RequestTimeout',
  'SignatureDoesNotMatch',
  'SlowDown',
  'TokenRefreshRequired',
]);

/** 4xx statuses that mean the deployment cannot reach S3 at all: denied, timed out, throttled. */
const S3_SYSTEMIC_CLIENT_STATUSES = new Set([403, 408, 429]);

/**
 * Whether an S3 error counts against the `s3` circuit.
 *
 * @remarks
 * - **Algorithm:** S3 answering this one request with a 4xx — the object is missing (404), a
 *   `CopySourceIfMatch` precondition failed (412), the range is unsatisfiable (416), the entity
 *   is too large — does not count: S3 answered. Network errors, timeouts, aborts and 5xx count,
 *   and so does a 4xx that every other call would hit too (403, 408, 429, and the credential,
 *   clock-skew, throttling and missing-bucket codes in {@link S3_SYSTEMIC_CLIENT_ERROR_NAMES}).
 * - **Failure modes:** none — pure predicate. An error without an HTTP status counts.
 * - **Side effects:** none.
 * - **Notes:** the `s3` integration default in `outbound-defaults.ts`, so it applies to every S3
 *   `outboundCall`. Without it a user could open the circuit for everyone by asking for keys that
 *   do not exist.
 */
export function countsS3ErrorAsCircuitFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return true;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  const status = candidate.$metadata?.httpStatusCode;
  if (typeof status !== 'number' || status < 400 || status >= 500) return true;
  if (S3_SYSTEMIC_CLIENT_STATUSES.has(status)) return true;
  return typeof candidate.name === 'string' && S3_SYSTEMIC_CLIENT_ERROR_NAMES.has(candidate.name);
}
