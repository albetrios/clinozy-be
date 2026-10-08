import { Worker } from 'bullmq';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import { parseJobDataOrDeadLetter } from '@/infrastructure/queue/dlq/poison-job.util.js';
import {
  getRetentionWorkerOptions,
  RETENTION_WORKER_CONCURRENCY,
} from '@/infrastructure/queue/worker-runtime/worker-options.js';
import { buildWorkerHandle } from '@/infrastructure/queue/worker-runtime/worker-close.util.js';
import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import type { WorkerHandle } from '@/infrastructure/queue/bootstrap.js';
import { runWithPropagatedTraceContext } from '@/infrastructure/observability/tracing/trace-context.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { dayCloseAutoCloseJobDataSchema } from '@/domains/app/sub-domains/billing/day-closes/queues/day-close-auto-close.job.schema.js';
import { DAY_CLOSE_AUTO_CLOSE_QUEUE_NAME } from '@/domains/app/sub-domains/billing/day-closes/queues/day-close-auto-close.queue.js';
import { runDayCloseAutoCloseJob } from './day-close-auto-close.processor.js';

/**
 * Closes one organization's past days per job (WC-39, B26).
 *
 * @remarks
 * - **Algorithm:** validates the payload (`parseJobDataOrDeadLetter` — a malformed one is
 *   dead-lettered at once), carries the trace, and runs {@link runDayCloseAutoCloseJob} inside
 *   the organization's context (`runOrganizationScopedWorkerJob`).
 * - **Failure modes:** a database error takes BullMQ's retry/backoff, then the dead letter;
 *   stalled jobs are warn-logged.
 * - **Side effects:** a BullMQ Redis connection; one Postgres checkout per running job.
 * - **Notes:** pull-based; the hourly sweep adds the jobs (one per organization at a time).
 */
export function createDayCloseAutoCloseWorker(): WorkerHandle {
  const worker = new Worker(
    DAY_CLOSE_AUTO_CLOSE_QUEUE_NAME,
    async (job) => {
      const jobData = await parseJobDataOrDeadLetter({
        schema: dayCloseAutoCloseJobDataSchema,
        job,
        queueName: DAY_CLOSE_AUTO_CLOSE_QUEUE_NAME,
      });
      const { organizationPublicId } = jobData;
      return runWithPropagatedTraceContext(
        { traceparent: jobData.traceparent, tracestate: jobData.tracestate },
        job.name,
        () =>
          runOrganizationScopedWorkerJob({ organizationPublicId }, (databaseHandle) =>
            runDayCloseAutoCloseJob(databaseHandle, organizationPublicId),
          ),
      );
    },
    {
      connection: getBullMQConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
      concurrency: RETENTION_WORKER_CONCURRENCY,
      ...getRetentionWorkerOptions(),
    },
  );

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId, queue: DAY_CLOSE_AUTO_CLOSE_QUEUE_NAME }, 'day-close-auto-close.stalled');
  });

  return buildWorkerHandle(worker, DAY_CLOSE_AUTO_CLOSE_QUEUE_NAME);
}
