import { getBullMQConnectionOptions } from '@/infrastructure/queue/connection.js';
import {
  getRetentionWorkerOptions,
  RETENTION_WORKER_CONCURRENCY,
} from '@/infrastructure/queue/worker-runtime/worker-options.js';
import { buildWorkerHandle } from '@/infrastructure/queue/worker-runtime/worker-close.util.js';
import { createProviderPausableWorker } from '@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js';
import { parseJobDataOrDeadLetter } from '@/infrastructure/queue/dlq/poison-job.util.js';
import { runWithPropagatedTraceContext } from '@/infrastructure/observability/tracing/trace-context.util.js';
import type { WorkerHandle } from '@/infrastructure/queue/bootstrap.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  type PatientIdeasJobData,
  patientIdeasJobDataSchema,
} from '@/domains/app/sub-domains/patients/patient-ideas/queues/patient-ideas.job.schema.js';
import { PATIENT_IDEAS_QUEUE_NAME } from '@/domains/app/sub-domains/patients/patient-ideas/queues/patient-ideas.queue.js';
import { runPatientIdeasJob } from './patient-ideas.processor.js';

/**
 * Refreshes each organization's stale patients' AI offering ideas (WC-47, D80).
 *
 * @remarks
 * - **Algorithm:** validates the payload (`parseJobDataOrDeadLetter` — a malformed one is
 *   dead-lettered at once), carries the trace, and runs {@link runPatientIdeasJob}, one job at a
 *   time (each holds Claude calls for up to a batch of patients).
 * - **Failure modes:** while Anthropic is down or throttling, the queue pauses on every replica
 *   (`createProviderPausableWorker`, provider `anthropic`) and the job waits without spending an
 *   attempt — the patients stay marked; other errors take BullMQ's retry/backoff, then the dead
 *   letter. Stalled jobs are warn-logged.
 * - **Side effects:** a BullMQ Redis connection; short Postgres checkouts around the Claude calls.
 * - **Notes:** pull-based; the five-minute ideas sweep adds the organizations. Runs only while
 *   `PATIENT_IDEAS_AI_ENABLED` is on (registry `isEnabled`).
 */
export function createPatientIdeasWorker(): WorkerHandle {
  const worker = createProviderPausableWorker<PatientIdeasJobData>({
    queueName: PATIENT_IDEAS_QUEUE_NAME,
    provider: 'anthropic',
    processor: async (job) => {
      const jobData = await parseJobDataOrDeadLetter({
        schema: patientIdeasJobDataSchema,
        job,
        queueName: PATIENT_IDEAS_QUEUE_NAME,
      });
      return runWithPropagatedTraceContext(
        { traceparent: jobData.traceparent, tracestate: jobData.tracestate },
        job.name,
        () => runPatientIdeasJob(jobData.organizationPublicId),
      );
    },
    workerOptions: {
      connection: getBullMQConnectionOptions(),
      concurrency: RETENTION_WORKER_CONCURRENCY,
      ...getRetentionWorkerOptions(),
    },
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId, queue: PATIENT_IDEAS_QUEUE_NAME }, 'patient-ideas.stalled');
  });

  return buildWorkerHandle(worker, PATIENT_IDEAS_QUEUE_NAME);
}
