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
import { TASK_RULES_SWEEP_QUEUE_NAME } from './task-rules.constants.js';
import { runTaskRulesSweepJob } from './task-rules-sweep.processor.js';

/**
 * The five-minute task rules sweep (TK4) — adds one task rules job per active team organization.
 *
 * @remarks
 * - **Algorithm:** a BullMQ `Worker` on {@link TASK_RULES_SWEEP_QUEUE_NAME} that runs
 *   {@link runTaskRulesSweepJob} (reads under the global retention cleanup context, the adds
 *   outside it).
 * - **Failure modes:** a read error feeds BullMQ retry/backoff; the next run repeats it.
 * - **Side effects:** a BullMQ Redis connection; a Postgres checkout per batch read; logs.
 * - **Notes:** registered through the worker registry and scheduled in `scheduler.ts`.
 */
export function createTaskRulesSweepWorker(): WorkerHandle {
  const worker = new Worker(TASK_RULES_SWEEP_QUEUE_NAME, async () => runTaskRulesSweepJob(), {
    connection: getBullMQConnectionOptions(),
    prefix: getBullMQKeyPrefix(),
    concurrency: RETENTION_WORKER_CONCURRENCY,
    ...getRetentionWorkerOptions(),
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId, queue: TASK_RULES_SWEEP_QUEUE_NAME }, 'task-rules-sweep.stalled');
  });

  return buildWorkerHandle({ worker, queueName: TASK_RULES_SWEEP_QUEUE_NAME });
}
