import { Worker } from 'bullmq';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import {
  getRetentionWorkerOptions,
  RETENTION_WORKER_CONCURRENCY,
} from '@/infrastructure/queue/worker-runtime/worker-options.js';
import { buildWorkerHandle } from '@/infrastructure/queue/worker-runtime/worker-close.util.js';
import type { WorkerHandle } from '@/infrastructure/queue/bootstrap.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { PATIENT_IDEAS_SWEEP_QUEUE_NAME } from './patient-ideas.constants.js';
import { runPatientIdeasSweepJob } from './patient-ideas-sweep.processor.js';

/**
 * The five-minute AI ideas sweep (WC-47, D80) — adds one ideas job per organization with stale
 * patients.
 *
 * @remarks
 * - **Algorithm:** a BullMQ `Worker` on {@link PATIENT_IDEAS_SWEEP_QUEUE_NAME} that runs
 *   {@link runPatientIdeasSweepJob} (reads under the global retention cleanup context, the adds
 *   outside it).
 * - **Failure modes:** a read error feeds BullMQ retry/backoff; the next run repeats it.
 * - **Side effects:** a BullMQ Redis connection; a Postgres checkout per batch read; logs.
 * - **Notes:** registered through the worker registry (on only while `PATIENT_IDEAS_AI_ENABLED`)
 *   and scheduled in `scheduler.ts`.
 */
export function createPatientIdeasSweepWorker(): WorkerHandle {
  const worker = new Worker(PATIENT_IDEAS_SWEEP_QUEUE_NAME, async () => runPatientIdeasSweepJob(), {
    connection: getBullMQConnectionOptions(),
    prefix: getBullMQKeyPrefix(),
    concurrency: RETENTION_WORKER_CONCURRENCY,
    ...getRetentionWorkerOptions(),
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId, queue: PATIENT_IDEAS_SWEEP_QUEUE_NAME }, 'patient-ideas-sweep.stalled');
  });

  return buildWorkerHandle(worker, PATIENT_IDEAS_SWEEP_QUEUE_NAME);
}
