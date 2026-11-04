import { type Job, UnrecoverableError } from 'bullmq';
import { getBullMQConnectionOptions } from '@/infrastructure/queue/connection.js';
import { isFinalJobFailure } from '@/infrastructure/queue/dlq/dead-letter.js';
import { parseJobDataOrDeadLetter } from '@/infrastructure/queue/dlq/poison-job.util.js';
import {
  getRetentionWorkerOptions,
  RETENTION_WORKER_CONCURRENCY,
} from '@/infrastructure/queue/worker-runtime/worker-options.js';
import { buildWorkerHandle } from '@/infrastructure/queue/worker-runtime/worker-close.util.js';
import { createProviderPausableWorker } from '@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js';
import type { WorkerHandle } from '@/infrastructure/queue/bootstrap.js';
import { runWithPropagatedTraceContext } from '@/infrastructure/observability/tracing/trace-context.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { configureImageThumbnailDecoder } from '@/domains/upload/utils/upload-thumbnail.util.js';
import {
  type PatientImageThumbnailJobData,
  patientImageThumbnailJobDataSchema,
} from '@/domains/app/sub-domains/patients/patient-images/queues/patient-image-thumbnail.job.schema.js';
import { PATIENT_IMAGE_THUMBNAIL_QUEUE_NAME } from '@/domains/app/sub-domains/patients/patient-images/queues/patient-image-thumbnail.queue.js';
import { PATIENT_IMAGE_THUMBNAIL_RECONCILE_JOB_NAME } from './patient-image-thumbnail.constants.js';
import {
  markPatientImageThumbnailJobFailed,
  type PatientImageThumbnailStorage,
  syncPatientImageThumbnail,
} from './patient-image-thumbnail.processor.js';
import { runPatientImageThumbnailReconcileJob } from './patient-image-thumbnail-reconcile.processor.js';

/**
 * Keeps each patient photo's thumbnail in step with its row (feat-patient-image-thumbnails), and
 * runs the 15-minute sweep that re-adds lost jobs.
 *
 * @remarks
 * - **Algorithm:** a provider-pausable worker (`s3`): on {@link PATIENT_IMAGE_THUMBNAIL_RECONCILE_JOB_NAME}
 *   it runs {@link runPatientImageThumbnailReconcileJob} (no payload — the sweep rides this queue,
 *   with no worker or pool of its own); any other job is validated (`parseJobDataOrDeadLetter` —
 *   a malformed one is dead-lettered at once), carries its trace and runs
 *   {@link syncPatientImageThumbnail}.
 * - **Failure modes:** an S3 outage pauses the whole queue (every replica) and parks the job
 *   without spending an attempt; any other error takes BullMQ's retry/backoff, then the dead
 *   letter; stalled jobs are warn-logged. A photo's job that fails for good — it stalled past
 *   `maxStalledCount` (the process died under it, an out-of-memory kill mid-decode included) or
 *   used every attempt — records `thumbnail_skip_reason = 'job_failed'`
 *   ({@link recordPatientImageThumbnailFinalFailure}), so no crash can loop through the sweep.
 * - **Side effects:** a BullMQ Redis connection; short Postgres checkouts per job, never held
 *   across the S3 call; image decoding in-process — one job at a time (concurrency 1), the decoder
 *   set up at start ({@link configureImageThumbnailDecoder}: no libvips cache, one thread). What
 *   one decode may hold is bounded from the image's header, not by the file's bytes (a 570 KB
 *   16-bit PNG decodes to 384 MB): a source over `UPLOAD_THUMBNAIL_MAX_INPUT_PIXELS` (64 MP) or
 *   `UPLOAD_THUMBNAIL_MAX_DECODED_BYTES` (192 MB decoded — about 240 MiB of RSS at worst) is refused
 *   before decoding, and one still running at `UPLOAD_THUMBNAIL_TIMEOUT_SECONDS` (30 s) is stopped.
 * - **Notes:** pull-based; jobs come from a photo's create, delete or restore (after the commit),
 *   the sweep and the backfill (`pnpm ops:patient-image-thumbnails-backfill`).
 */
export function createPatientImageThumbnailWorker(
  storage: PatientImageThumbnailStorage,
): WorkerHandle {
  configureImageThumbnailDecoder();
  const worker = createProviderPausableWorker<PatientImageThumbnailJobData>({
    queueName: PATIENT_IMAGE_THUMBNAIL_QUEUE_NAME,
    provider: 's3',
    processor: async (job) => {
      if (job.name === PATIENT_IMAGE_THUMBNAIL_RECONCILE_JOB_NAME) {
        return runPatientImageThumbnailReconcileJob();
      }
      const jobData = await parseJobDataOrDeadLetter({
        schema: patientImageThumbnailJobDataSchema,
        job,
        queueName: PATIENT_IMAGE_THUMBNAIL_QUEUE_NAME,
      });
      return runWithPropagatedTraceContext({
        carrier: { traceparent: jobData.traceparent, tracestate: jobData.tracestate },
        spanName: job.name,
        callback: () =>
          syncPatientImageThumbnail({
            organizationPublicId: jobData.organizationPublicId,
            patientImagePublicId: jobData.patientImagePublicId,
            storage,
          }),
      });
    },
    workerOptions: {
      connection: getBullMQConnectionOptions(),
      concurrency: RETENTION_WORKER_CONCURRENCY,
      ...getRetentionWorkerOptions(),
    },
  });

  worker.on('failed', (job, error) => {
    void recordPatientImageThumbnailFinalFailure({ job, error }).catch((failure: unknown) => {
      logger.error(
        { err: failure, jobId: job?.id, queue: PATIENT_IMAGE_THUMBNAIL_QUEUE_NAME },
        'patient-image-thumbnail.job_failed_not_recorded',
      );
    });
  });

  worker.on('stalled', (jobId) => {
    logger.warn(
      { jobId, queue: PATIENT_IMAGE_THUMBNAIL_QUEUE_NAME },
      'patient-image-thumbnail.stalled',
    );
  });

  return buildWorkerHandle({ worker, queueName: PATIENT_IMAGE_THUMBNAIL_QUEUE_NAME });
}

/**
 * BullMQ's `failed` listener of the thumbnail queue: when a photo's job has failed for good, records
 * `job_failed` on the photo so the sweep and the backfill never hand it to the worker again.
 *
 * @remarks
 * - **Algorithm:** a failure is final when the job used its last attempt
 *   (`isFinalJobFailure`) or threw `UnrecoverableError` — what BullMQ throws, without running the
 *   processor, for a job that stalled more than `maxStalledCount` times; then, for a photo job
 *   (not the sweep's) whose payload parses, {@link markPatientImageThumbnailJobFailed} in the
 *   payload's organization context. A retryable failure, the sweep's job and a malformed payload
 *   (already dead-lettered) record nothing.
 * - **Failure modes:** a database error rejects; the listener logs it
 *   (`patient-image-thumbnail.job_failed_not_recorded`) and the sweep may re-queue the photo once.
 * - **Side effects:** at most one row update.
 * - **Notes:** answers whether it recorded the reason.
 */
export async function recordPatientImageThumbnailFinalFailure({
  job,
  error,
}: {
  job: Pick<Job, 'name' | 'data' | 'opts' | 'attemptsMade'> | undefined;
  error: Error;
}): Promise<boolean> {
  if (!job || job.name === PATIENT_IMAGE_THUMBNAIL_RECONCILE_JOB_NAME) return false;
  if (!(error instanceof UnrecoverableError || isFinalJobFailure(job))) return false;
  const jobData = patientImageThumbnailJobDataSchema.safeParse(job.data);
  if (!jobData.success) return false;
  return markPatientImageThumbnailJobFailed({
    organizationPublicId: jobData.data.organizationPublicId,
    patientImagePublicId: jobData.data.patientImagePublicId,
  });
}
