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
import { taskRulesJobDataSchema } from '@/domains/app/sub-domains/tasks/queues/task-rules.job.schema.js';
import { TASK_RULES_QUEUE_NAME } from '@/domains/app/sub-domains/tasks/queues/task-rules.queue.js';
import { requestContactMessageDelivery } from '@/domains/app/sub-domains/contacts/contact-activities/queues/contact-message-delivery.queue.js';
import { runTaskRulesJob } from './task-rules.processor.js';

/**
 * Runs one organization's task rules per job (TK4, TK10).
 *
 * @remarks
 * - **Algorithm:** validates the payload (`parseJobDataOrDeadLetter` — a malformed one is
 *   dead-lettered at once), carries the trace, and runs {@link runTaskRulesJob} inside the
 *   organization's context (`runOrganizationScopedWorkerJob`); when Clinozy's steps queued messages,
 *   asks for the organization's delivery job after the commit (launch D77).
 * - **Failure modes:** a database error takes BullMQ's retry/backoff, then the dead letter;
 *   stalled jobs are warn-logged.
 * - **Side effects:** a BullMQ Redis connection; one Postgres checkout per running job.
 * - **Notes:** pull-based; the five-minute sweep adds the jobs (one per organization at a time).
 */
export function createTaskRulesWorker(): WorkerHandle {
  const worker = new Worker(
    TASK_RULES_QUEUE_NAME,
    async (job) => {
      const jobData = await parseJobDataOrDeadLetter({
        schema: taskRulesJobDataSchema,
        job,
        queueName: TASK_RULES_QUEUE_NAME,
      });
      const { organizationPublicId } = jobData;
      return runWithPropagatedTraceContext(
        { traceparent: jobData.traceparent, tracestate: jobData.tracestate },
        job.name,
        async () => {
          const counts = await runOrganizationScopedWorkerJob(
            { organizationPublicId },
            (databaseHandle) => runTaskRulesJob(databaseHandle, organizationPublicId),
          );
          // Clinozy's steps queued messages (TK10): send them now, after the commit (D77).
          if (counts.handledCount + counts.messageCount > 0)
            await requestContactMessageDelivery(organizationPublicId);
          return counts;
        },
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
    logger.warn({ jobId, queue: TASK_RULES_QUEUE_NAME }, 'task-rules.stalled');
  });

  return buildWorkerHandle(worker, TASK_RULES_QUEUE_NAME);
}
