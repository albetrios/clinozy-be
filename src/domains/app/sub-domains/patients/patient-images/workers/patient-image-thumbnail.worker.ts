import { getBullMQConnectionOptions } from '@/infrastructure/queue/connection.js';
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
import {
  type PatientImageThumbnailJobData,
  patientImageThumbnailJobDataSchema,
} from '@/domains/app/sub-domains/patients/patient-images/queues/patient-image-thumbnail.job.schema.js';
import { PATIENT_IMAGE_THUMBNAIL_QUEUE_NAME } from '@/domains/app/sub-domains/patients/patient-images/queues/patient-image-thumbnail.queue.js';
import { PATIENT_IMAGE_THUMBNAIL_RECONCILE_JOB_NAME } from './patient-image-thumbnail.constants.js';
import {
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
 *   letter; stalled jobs are warn-logged.
 * - **Side effects:** a BullMQ Redis connection; short Postgres checkouts per job, never held
 *   across the S3 call; image decoding in-process (concurrency 1 keeps a 15 MB decode alone).
 * - **Notes:** pull-based; jobs come from a photo's create, delete or restore (after the commit),
 *   the sweep and the backfill (`pnpm ops:patient-image-thumbnails-backfill`).
 */
export function createPatientImageThumbnailWorker(
  storage: PatientImageThumbnailStorage,
): WorkerHandle {
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

  worker.on('stalled', (jobId) => {
    logger.warn(
      { jobId, queue: PATIENT_IMAGE_THUMBNAIL_QUEUE_NAME },
      'patient-image-thumbnail.stalled',
    );
  });

  return buildWorkerHandle({ worker, queueName: PATIENT_IMAGE_THUMBNAIL_QUEUE_NAME });
}
