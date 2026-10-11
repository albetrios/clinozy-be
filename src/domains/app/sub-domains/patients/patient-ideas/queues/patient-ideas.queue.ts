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
import { ANTHROPIC_CIRCUIT_RESET_TIMEOUT_MS } from '@/infrastructure/resilience/circuit-breaker.js';
import { captureTraceContextForPropagation } from '@/infrastructure/observability/tracing/trace-context.util.js';
import { parseBullMQJobData } from '@/shared/utils/validation/bullmq-job-validation.util.js';
import { SEVEN_DAYS_SECONDS } from '@/shared/constants/ttl.constants.js';
import { type PatientIdeasJobData, patientIdeasJobDataSchema } from './patient-ideas.job.schema.js';

/** BullMQ queue that refreshes one organization's stale patients' AI ideas (WC-47, D80). */
export const PATIENT_IDEAS_QUEUE_NAME = 'patient-ideas';

let patientIdeasQueue: Queue<PatientIdeasJobData> | null = null;

function getPatientIdeasQueue(): Queue<PatientIdeasJobData> {
  if (patientIdeasQueue) return patientIdeasQueue;
  patientIdeasQueue = new Queue<PatientIdeasJobData>(PATIENT_IDEAS_QUEUE_NAME, {
    connection: getBullMQProducerConnectionOptions(),
    prefix: getBullMQKeyPrefix(),
    defaultJobOptions: {
      removeOnComplete: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
      removeOnFail: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
      attempts: 3,
      // The first retry waits out the `anthropic` circuit's reset window
      backoff: {
        type: 'exponential',
        delay: ANTHROPIC_CIRCUIT_RESET_TIMEOUT_MS,
        jitter: QUEUE_RETRY_JITTER_RATIO,
      },
    },
  });
  return patientIdeasQueue;
}

/**
 * One live ideas job per organization (WC-47) — a sweep that finds it still waiting adds nothing,
 * and the next sweep adds a fresh one once it finished.
 */
export function patientIdeasDeduplication(organizationPublicId: string): DeduplicationOptions {
  return { id: `patient-ideas-${organizationPublicId}` };
}

/**
 * Enqueues an organization's ideas refresh (WC-47, D80) — a unique `jobId` per add and the
 * organization's deduplication key, so a retained finished job never swallows a later add.
 *
 * @remarks
 * - **Algorithm:** validates the payload, then `queue.add` with the trace context.
 * - **Failure modes:** propagates BullMQ enqueue errors to the sweep, which logs them and goes on;
 *   the stale marks stay in Postgres and the next five-minute sweep adds the organization again.
 * - **Side effects:** at most one job on the queue per organization at a time.
 */
export async function enqueuePatientIdeas(organizationPublicId: string): Promise<void> {
  const jobData = parseBullMQJobData({
    schema: patientIdeasJobDataSchema,
    data: { organizationPublicId, ...captureTraceContextForPropagation() },
    queueName: PATIENT_IDEAS_QUEUE_NAME,
  });
  await getPatientIdeasQueue().add('refresh-patient-ideas', jobData, {
    jobId: `patient-ideas-${organizationPublicId}-${randomUUID()}`,
    deduplication: patientIdeasDeduplication(organizationPublicId),
  });
}

/** Closes the lazily created producer queue during graceful shutdown. */
export async function closePatientIdeasQueue(): Promise<void> {
  if (patientIdeasQueue) {
    await patientIdeasQueue.close();
    patientIdeasQueue = null;
  }
}
