import {
  findPendingUploadsOlderThan,
  hardDeleteUploadsByInternalIds,
  markConfirmedByInternalId,
  setUploadStatusByInternalId,
  type PendingUploadSweepRow,
} from '@/domains/upload/upload.repository.js';
import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import type { ObjectStoragePort } from '@/infrastructure/storage/object-storage.port.js';
import { getDefaultS3ObjectStorageAdapter } from '@/infrastructure/storage/s3-adapter.js';
import { PRESIGNED_URL_EXPIRY_SECONDS } from '@/shared/constants/ttl.constants.js';
import { env } from '@/shared/config/env.config.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  isMagicByteVerifiable,
  MAGIC_BYTE_PREFIX_LENGTH,
  verifyFileMagicBytes,
} from '@/shared/utils/validation/file-magic.util.js';
import { UPLOAD_PENDING_SWEEP_BATCH_SIZE } from './upload-pending-sweep.constants.js';
import { isSvgContentType } from '@/domains/upload/utils/upload-svg.util.js';
import {
  UPLOAD_PENDING_KEY_PREFIX,
  stripPendingObjectKeyPrefix,
} from '@/domains/upload/upload.constants.js';

/**
 * Outcome counters for one {@link runUploadPendingSweepJob} run.
 *
 * @remarks
 * - **scannedCount:** stale PENDING rows considered in this batch.
 * - **autoConfirmedCount:** rows whose S3 object existed with a matching
 *   length/content-type and were transitioned to `UPLOADED`.
 * - **failedCount:** rows whose S3 object existed but failed verification;
 *   transitioned to `FAILED` so they can never be attached.
 * - **deletedCount:** orphan rows whose S3 object was explicitly not found; hard-deleted
 *   after a best-effort S3 delete.
 * - **transientCount:** rows left PENDING because storage failed while they were checked or
 *   published (audit-#5) — re-evaluated by the next scheduled sweep, never destroyed.
 */
export type UploadPendingSweepResult = {
  scannedCount: number;
  autoConfirmedCount: number;
  failedCount: number;
  deletedCount: number;
  transientCount: number;
};

/** What the sweep does with one stale PENDING row. */
type PendingUploadVerdict =
  | { kind: 'auto_confirm'; sourceETag?: string }
  | { kind: 'fail' }
  | { kind: 'orphan' }
  | { kind: 'transient' };

/**
 * Reconciles stale PENDING uploads — clients that obtained a presigned URL but never
 * called confirm. For each candidate row past the grace window:
 *
 * - Object exists and verifies (length, type, magic bytes) → publish to the final key, mark UPLOADED.
 * - Object exists but fails verification                   → mark FAILED (never attachable).
 * - Object explicitly not found                            → hard-delete the orphan row.
 * - Storage failed while checking or publishing            → leave PENDING for the next sweep.
 *
 * @remarks
 * - **Algorithm:** cutoff = now − (`PRESIGNED_URL_EXPIRY_SECONDS` +
 *   `UPLOAD_PENDING_SWEEP_GRACE_SECONDS`) — every presigned URL of a candidate has expired.
 *   Reads up to {@link UPLOAD_PENDING_SWEEP_BATCH_SIZE} oldest PENDING rows, decides each
 *   row's verdict from S3, and applies it. Every database step runs in its own short
 *   global-retention context (RLS lets the sweep cross tenants); every S3 call runs outside them.
 * - **Failure modes:** a storage failure is never a verdict on the object — the row stays
 *   PENDING (counted in `transientCount`). Only an explicit 404 orphan-deletes a row. Repository
 *   errors bubble to BullMQ for retry.
 * - **Side effects:** updates `upload.uploads` status, deletes orphan rows, copies verified
 *   objects to their final key and deletes the pending ones. No events emitted.
 * - **Notes:** batch-scoped — large backlogs drain over multiple repeats. `objectStorage` is
 *   injectable for tests.
 */
export async function runUploadPendingSweepJob(
  objectStorage: ObjectStoragePort = getDefaultS3ObjectStorageAdapter(),
): Promise<UploadPendingSweepResult> {
  const graceSeconds = env.UPLOAD_PENDING_SWEEP_GRACE_SECONDS;
  const cutoffMs = Date.now() - (PRESIGNED_URL_EXPIRY_SECONDS + graceSeconds) * 1000;
  const cutoffDate = new Date(cutoffMs);

  const rows = await runGlobalRetentionWorkerJob((databaseHandle) =>
    findPendingUploadsOlderThan(databaseHandle, cutoffDate, UPLOAD_PENDING_SWEEP_BATCH_SIZE),
  );

  logger.info(
    {
      scannedCount: rows.length,
      cutoffDate: cutoffDate.toISOString(),
      graceSeconds,
      batchSize: UPLOAD_PENDING_SWEEP_BATCH_SIZE,
    },
    'upload-pending-sweep.starting',
  );

  const counts = { autoConfirmedCount: 0, failedCount: 0, transientCount: 0 };
  const idsToHardDelete: number[] = [];

  for (const row of rows) {
    const verdict = await resolvePendingUploadVerdict({ row, objectStorage });
    switch (verdict.kind) {
      case 'auto_confirm': {
        const published = await publishPendingUpload({ row, objectStorage, verdict });
        counts[published ? 'autoConfirmedCount' : 'transientCount'] += 1;
        break;
      }
      case 'fail':
        await runGlobalRetentionWorkerJob((databaseHandle) =>
          setUploadStatusByInternalId(databaseHandle, row.id, 'FAILED'),
        );
        counts.failedCount += 1;
        logger.warn(
          { uploadPublicId: row.public_id, fileKey: row.file_key },
          'upload-pending-sweep.verificationFailed',
        );
        break;
      case 'transient':
        // audit-#5: a storage failure (timeout / throttle / circuit-open / IAM) is NOT proof the
        // object is missing or bad. Leave the row PENDING for the next scheduled sweep.
        counts.transientCount += 1;
        logger.warn(
          { uploadPublicId: row.public_id, fileKey: row.file_key },
          'upload-pending-sweep.transientStorageSkipped',
        );
        break;
      case 'orphan': {
        // Object explicitly not found — remove any leftover byte (idempotent), queue the row delete.
        const objectDelete = await objectStorage.deleteObject(row.file_key);
        if (objectDelete.kind !== 'deleted') {
          logger.warn(
            { uploadPublicId: row.public_id, fileKey: row.file_key },
            'upload-pending-sweep.s3DeleteFailed',
          );
        }
        idsToHardDelete.push(row.id);
        break;
      }
    }
  }

  const deletedCount = await runGlobalRetentionWorkerJob((databaseHandle) =>
    hardDeleteUploadsByInternalIds(databaseHandle, idsToHardDelete),
  );

  const result = { scannedCount: rows.length, ...counts, deletedCount };
  logger.info(result, 'upload-pending-sweep.completed');
  return result;
}

/**
 * sec-UP finding #20: the HTTP confirm path guarantees a servable row never references the
 * overwritable `pending/` key (sec-UP1); the sweep keeps the same invariant — copy the bytes to
 * the final key, then flip status and `file_key` in one UPDATE. Returns false (row stays PENDING)
 * when the copy fails or the pending object was written again since it was verified.
 */
async function publishPendingUpload(options: {
  row: PendingUploadSweepRow;
  objectStorage: ObjectStoragePort;
  verdict: { sourceETag?: string };
}): Promise<boolean> {
  const { row, objectStorage, verdict } = options;
  const finalKey = stripPendingObjectKeyPrefix(row.file_key);
  try {
    const copy = await objectStorage.copyObject({
      sourceKey: row.file_key,
      destinationKey: finalKey,
      contentType: row.mime_type,
      ...(verdict.sourceETag === undefined ? {} : { sourceETag: verdict.sourceETag }),
    });
    if (copy.kind === 'source_changed') {
      // Written again since it was verified: leave it PENDING so the next pass verifies the new
      // bytes instead of publishing unverified ones.
      logger.info(
        { uploadPublicId: row.public_id, fileKey: row.file_key },
        'upload-pending-sweep.sourceChangedSinceVerify',
      );
      return false;
    }
  } catch (copyError) {
    logger.warn(
      { uploadPublicId: row.public_id, fileKey: row.file_key, error: copyError },
      'upload-pending-sweep.copyToFinalKeyFailed',
    );
    return false;
  }
  await runGlobalRetentionWorkerJob((databaseHandle) =>
    markConfirmedByInternalId(databaseHandle, row.id, finalKey),
  );
  // Best-effort cleanup of the pending bytes; the row is already servable off the final key.
  const pendingDelete = await objectStorage.deleteObject(row.file_key);
  if (pendingDelete.kind !== 'deleted') {
    logger.warn(
      { uploadPublicId: row.public_id, pendingKey: row.file_key },
      'upload-pending-sweep.pendingDeleteFailedAfterPublish',
    );
  }
  logger.info(
    { uploadPublicId: row.public_id, pendingKey: row.file_key, finalKey },
    'upload-pending-sweep.autoConfirmed',
  );
  return true;
}

async function resolvePendingUploadVerdict({
  row,
  objectStorage,
}: {
  row: PendingUploadSweepRow;
  objectStorage: ObjectStoragePort;
}): Promise<PendingUploadVerdict> {
  // sec-UP finding #20: refuse rows whose `file_key` is not prefixed with the pending namespace —
  // such a row bypassed the whole publish ceremony, and auto-confirming it would launder it into
  // UPLOADED. The HTTP confirm path makes the same assertion (sec-UP1).
  if (!row.file_key.startsWith(UPLOAD_PENDING_KEY_PREFIX)) {
    logger.warn(
      { uploadPublicId: row.public_id, fileKey: row.file_key },
      'upload-pending-sweep.non_pending_key_refused',
    );
    return { kind: 'fail' };
  }
  // sec-UP2: SVG is published only through confirm, which sanitizes the bytes; the sweep never
  // auto-confirms it.
  if (isSvgContentType(row.mime_type)) {
    return { kind: 'fail' };
  }
  // audit-#5: only an explicit not-found may orphan-delete; a storage failure leaves the row.
  const head = await objectStorage.headObjectResult(row.file_key);
  if (head.kind === 'transient_error') return { kind: 'transient' };
  if (head.kind === 'not_found') return { kind: 'orphan' };
  const { contentLength, contentType } = head.metadata;
  // An object S3 reports without a length cannot be verified — fail it, never delete it.
  if (contentLength === undefined || contentLength !== row.file_size) return { kind: 'fail' };
  // S3 may not echo a content type; only a reported one can mismatch.
  if (contentType !== undefined && contentType !== row.mime_type) return { kind: 'fail' };
  if (!isMagicByteVerifiable(row.mime_type)) return { kind: 'auto_confirm' };
  // A magic-byte type with no bytes has no signature to match (and a ranged GET on it is a 416).
  if (contentLength === 0) return { kind: 'fail' };

  let leadingBytes: Awaited<ReturnType<ObjectStoragePort['getObjectFirstBytes']>>;
  try {
    leadingBytes = await objectStorage.getObjectFirstBytes({
      key: row.file_key,
      byteCount: MAGIC_BYTE_PREFIX_LENGTH,
    });
  } catch (error) {
    // The read failed — that says nothing about the bytes. Leave the row for the next sweep.
    logger.warn(
      { uploadPublicId: row.public_id, fileKey: row.file_key, error },
      'upload-pending-sweep.magicByteReadFailed',
    );
    return { kind: 'transient' };
  }
  if (leadingBytes === null) return { kind: 'orphan' };
  if (!verifyFileMagicBytes({ buffer: leadingBytes.body, contentType: row.mime_type }))
    return { kind: 'fail' };
  return { kind: 'auto_confirm', sourceETag: leadingBytes.eTag };
}
