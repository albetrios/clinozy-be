import { randomUUID } from 'node:crypto';
import { Queue, type DeduplicationOptions } from 'bullmq';
import {
  getBullMQKeyPrefix,
  getBullMQProducerConnectionOptions,
} from '@/infrastructure/queue/connection.js';
import {
  DEFAULT_JOB_RETENTION_COUNT,
  QUEUE_RETRY_JITTER_RATIO,
} from '@/infrastructure/queue/queue.constants.js';
import { captureTraceContextForPropagation } from '@/infrastructure/observability/tracing/trace-context.util.js';
import { parseBullMQJobData } from '@/shared/utils/validation/bullmq-job-validation.util.js';
import { SEVEN_DAYS_SECONDS } from '@/shared/constants/ttl.constants.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  type PatientImageThumbnailJobData,
  patientImageThumbnailJobDataSchema,
} from './patient-image-thumbnail.job.schema.js';

/** BullMQ queue that keeps a patient photo's thumbnail in step with its row. */
export const PATIENT_IMAGE_THUMBNAIL_QUEUE_NAME = 'patient-image-thumbnail';

/** The job that makes or removes one photo's thumbnail. */
export const PATIENT_IMAGE_THUMBNAIL_SYNC_JOB_NAME = 'sync-patient-image-thumbnail';

/** First retry after 30 seconds, then exponential. */
const RETRY_DELAY_MS = 30_000;

let patientImageThumbnailQueue: Queue<PatientImageThumbnailJobData> | null = null;

function getPatientImageThumbnailQueue(): Queue<PatientImageThumbnailJobData> {
  if (patientImageThumbnailQueue) return patientImageThumbnailQueue;
  patientImageThumbnailQueue = new Queue<PatientImageThumbnailJobData>(
    PATIENT_IMAGE_THUMBNAIL_QUEUE_NAME,
    {
      connection: getBullMQProducerConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
      defaultJobOptions: {
        removeOnComplete: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
        removeOnFail: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
        attempts: 5,
        backoff: { type: 'exponential', delay: RETRY_DELAY_MS, jitter: QUEUE_RETRY_JITTER_RATIO },
      },
    },
  );
  return patientImageThumbnailQueue;
}

/**
 * One waiting thumbnail job per photo, plus one more while it runs — a delete committed while
 * the photo's thumbnail is being made is picked up by the job kept behind it.
 */
export function patientImageThumbnailDeduplication(
  patientImagePublicId: string,
): DeduplicationOptions {
  return { id: `patient-image-thumbnail-${patientImagePublicId}`, keepLastIfActive: true };
}

/**
 * Enqueues a photo's thumbnail job — a unique `jobId` per add and the photo's deduplication key,
 * so a retained finished job never swallows a later add (a restore after a delete).
 *
 * @remarks
 * - **Algorithm:** validates the payload, then `queue.add` with the trace context.
 * - **Failure modes:** propagates BullMQ enqueue errors (the sweep and the backfill count them).
 * - **Side effects:** at most one waiting job per photo, and one more while it runs.
 */
export async function enqueuePatientImageThumbnailSync(options: {
  organizationPublicId: string;
  patientImagePublicId: string;
}): Promise<void> {
  const jobData = parseBullMQJobData({
    schema: patientImageThumbnailJobDataSchema,
    data: { ...options, ...captureTraceContextForPropagation() },
    queueName: PATIENT_IMAGE_THUMBNAIL_QUEUE_NAME,
  });
  await getPatientImageThumbnailQueue().add(PATIENT_IMAGE_THUMBNAIL_SYNC_JOB_NAME, jobData, {
    jobId: `patient-image-thumbnail-${options.patientImagePublicId}-${randomUUID()}`,
    deduplication: patientImageThumbnailDeduplication(options.patientImagePublicId),
  });
}

/**
 * {@link enqueuePatientImageThumbnailSync} that never throws — a photo's create, delete or
 * restore asks for it after the commit; a Redis outage fails nothing (the sweep adds it later).
 *
 * @remarks
 * - **Failure modes:** none — an enqueue error is logged (`patient-image-thumbnail.enqueue_failed`).
 */
export async function requestPatientImageThumbnailSync(options: {
  organizationPublicId: string;
  patientImagePublicId: string;
}): Promise<void> {
  try {
    await enqueuePatientImageThumbnailSync(options);
  } catch (error) {
    logger.warn({ error, ...options }, 'patient-image-thumbnail.enqueue_failed');
  }
}

/** Closes the lazily created producer queue during graceful shutdown. */
export async function closePatientImageThumbnailQueue(): Promise<void> {
  if (patientImageThumbnailQueue) {
    await patientImageThumbnailQueue.close();
    patientImageThumbnailQueue = null;
  }
}
