import type { S3HeadResult } from '@/infrastructure/storage/s3-error.util.js';

/**
 * Subset of S3 `HeadObject` metadata. Either field may be `undefined` when the object exists but
 * the provider does not surface it.
 */
export interface UploadedObjectMetadata {
  contentType: string | undefined;
  contentLength: number | undefined;
}

/**
 * Outcome of {@link ObjectStoragePort.verifyUploadedObject}: the object matches what the client
 * declared, or the reason it does not. A storage failure is never a verdict — it is thrown.
 */
export type UploadedObjectVerdict =
  | { kind: 'verified'; metadata: UploadedObjectMetadata }
  | {
      kind: 'rejected';
      reason:
        | 'not_found'
        | 'content_length_unknown'
        | 'content_length_mismatch'
        | 'content_type_mismatch';
    };

/**
 * Outcome of {@link ObjectStoragePort.deleteObject}. S3 deletes are idempotent: a key that does
 * not exist reports `deleted`. `circuitOpen` says storage is refusing every call right now, so a
 * caller working through a batch should stop rather than walk the rest of it.
 */
export type ObjectDeleteResult = { kind: 'deleted' } | { kind: 'failed'; circuitOpen: boolean };

/**
 * Outcome of {@link ObjectStoragePort.copyObject}: `source_changed` when the copy was pinned to a
 * `sourceETag` and the source object no longer has it (someone wrote it again since it was read).
 * A storage failure is never an outcome — it is thrown.
 */
export type ObjectCopyResult = { kind: 'copied' } | { kind: 'source_changed' };

/** Browser-postable presigned upload: a form `url` plus hidden `fields` to submit with the file. */
export interface PresignedUploadPost {
  url: string;
  fields: Record<string, string>;
}

/**
 * Port for object storage (S3-compatible). Domain upload code depends on this abstraction.
 */
export interface ObjectStoragePort {
  createPresignedUploadUrl(options: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<string>;

  /**
   * Presigned POST with a `content-length-range` policy so S3 itself rejects oversized or
   * empty uploads at upload time (stronger than a presigned PUT, which only signs a single
   * Content-Length). Returns the form action URL and the policy fields to submit.
   */
  createPresignedUploadPost(options: {
    key: string;
    contentType: string;
    minContentLength: number;
    maxContentLength: number;
    expiresInSeconds: number;
    metadata?: Record<string, string>;
  }): Promise<PresignedUploadPost>;

  /**
   * HEADs `key` and compares it with what the client declared at create time. Throws only when
   * storage itself fails (an `ExternalServiceError`, or the `CircuitBreakerOpenError` an open
   * circuit raises) — never mark an upload FAILED on a throw.
   */
  verifyUploadedObject(options: {
    key: string;
    expected: { contentType: string; contentLength: number };
  }): Promise<UploadedObjectVerdict>;

  /**
   * HEAD as a result: `found`, `not_found` (an explicit 404 — the only outcome that may drive
   * destructive cleanup), or `transient_error` for every other failure.
   */
  headObjectResult(key: string): Promise<S3HeadResult<UploadedObjectMetadata>>;

  /** HEAD for callers that only branch on existence: `null` when not found, throws on a failure. */
  headObject(key: string): Promise<UploadedObjectMetadata | null>;

  deleteObject(key: string): Promise<ObjectDeleteResult>;

  putObject(options: {
    key: string;
    body: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<void>;

  /**
   * Server-side copy of an existing object to a new key (no bytes transit the app). Used by the
   * upload confirm step to publish a verified pending object to its immutable final key so the
   * served object can never be overwritten via the client's still-valid presigned upload URL. The
   * destination `contentType` is set on the copy so the served object carries the verified type.
   * `sourceETag` (sec-re-10) is the S3 ETag captured at the verify step; when supplied the
   * adapter passes it as `CopySourceIfMatch`, and a source whose bytes changed between verify and
   * copy reports `source_changed` instead of being copied (closes the pending-PUT replay TOCTOU
   * window). Storage failures throw.
   */
  copyObject(options: {
    sourceKey: string;
    destinationKey: string;
    contentType: string;
    sourceETag?: string;
  }): Promise<ObjectCopyResult>;

  getObject(key: string): Promise<{ body: Buffer; contentType: string | undefined }>;

  /**
   * Fetches the first `byteCount` bytes of an object via a ranged GET, for magic-byte
   * verification without buffering the whole upload. `null` when the object does not exist;
   * throws on any other failure (including a response without an ETag). `eTag` (sec-re-10) is the
   * object's ETag at the time of the read; callers pass it to `copyObject` to close the
   * verify→copy TOCTOU window.
   */
  getObjectFirstBytes(options: {
    key: string;
    byteCount: number;
  }): Promise<{ body: Buffer; contentType: string | undefined; eTag: string } | null>;

  createPresignedDownloadUrl(options: { key: string; expiresInSeconds: number }): Promise<string>;
}
