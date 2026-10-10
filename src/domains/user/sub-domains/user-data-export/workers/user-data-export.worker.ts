import { getBullMQConnectionOptions } from '@/infrastructure/queue/connection.js';
import { getDefaultWorkerOptions } from '@/infrastructure/queue/worker-runtime/worker-options.js';
import { getWorkerConcurrencyNotify } from '@/shared/config/worker-concurrency.util.js';
import { USER_DATA_EXPORT_QUEUE_NAME } from '@/domains/user/sub-domains/user-data-export/queues/user-data-export.queue.js';
import { userDataExportJobDataSchema } from '@/domains/user/sub-domains/user-data-export/queues/user-data-export.job.schema.js';
import { runUserDataExportJob } from '@/domains/user/sub-domains/user-data-export/workers/user-data-export.processor.js';
import { runUserDataExportReclaimJob } from '@/domains/user/sub-domains/user-data-export/workers/user-data-export-reclaim.processor.js';
import { USER_DATA_EXPORT_RECLAIM_JOB_NAME } from '@/domains/user/sub-domains/user-data-export/workers/user-data-export-reclaim.constants.js';
import type { UserDataExportService } from '@/domains/user/sub-domains/user-data-export/user-data-export.service.js';
import { buildWorkerHandle } from '@/infrastructure/queue/worker-runtime/worker-close.util.js';
import { createProviderPausableWorker } from '@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js';
import { parseJobDataOrDeadLetter } from '@/infrastructure/queue/dlq/poison-job.util.js';
import { runWithPropagatedTraceContext } from '@/infrastructure/observability/tracing/trace-context.util.js';
import type { WorkerHandle } from '@/infrastructure/queue/bootstrap.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/**
 * Construct the BullMQ {@link Worker} that drains the `user-data-export` queue.
 *
 * @remarks
 * - **Algorithm:** for each job, validates the payload with {@link userDataExportJobDataSchema},
 *   then delegates to {@link runUserDataExportJob}.
 * - **Failure modes:** while S3 is down the queue pauses on every replica and probes every five
 *   minutes, spending no attempt (`createProviderPausableWorker`); schema parse errors and other
 *   exceptions propagate to BullMQ, which applies the queue's retry/backoff and DLQ policy;
 *   cancellation is handled in the processor.
 * - **Side effects:** consumes Redis, writes Postgres + S3, and logs `stalled` events.
 * - **Notes:** concurrency comes from `getWorkerConcurrencyNotify` (shared with notification
 *   delivery); registered via `worker-registration.registry.ts`, never wired directly in
 *   `bootstrap.ts`.
 */
export function createUserDataExportWorker(
  userDataExportService: UserDataExportService,
): WorkerHandle {
  const worker = createProviderPausableWorker({
    queueName: USER_DATA_EXPORT_QUEUE_NAME,
    provider: 's3',
    processor: async (job) => {
      // The lost-enqueue sweep rides this queue (no worker or pool of its own); it has no payload.
      if (job.name === USER_DATA_EXPORT_RECLAIM_JOB_NAME) {
        await runUserDataExportReclaimJob();
        return;
      }
      const jobData = await parseJobDataOrDeadLetter({
        schema: userDataExportJobDataSchema,
        job,
        queueName: USER_DATA_EXPORT_QUEUE_NAME,
      });
      await runWithPropagatedTraceContext(
        { traceparent: jobData.traceparent, tracestate: jobData.tracestate },
        job.name,
        () =>
          runUserDataExportJob(jobData, userDataExportService, {
            isFinalAttempt: job.attemptsMade + 1 >= Math.max(1, job.opts.attempts ?? 1),
          }),
      );
    },
    workerOptions: {
      connection: getBullMQConnectionOptions(),
      concurrency: getWorkerConcurrencyNotify(),
      ...getDefaultWorkerOptions(),
    },
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId, queue: USER_DATA_EXPORT_QUEUE_NAME }, 'user-data-export.worker.stalled');
  });

  return buildWorkerHandle(worker, USER_DATA_EXPORT_QUEUE_NAME);
}
