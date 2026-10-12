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
import { type TaskRulesJobData, taskRulesJobDataSchema } from './task-rules.job.schema.js';

/** BullMQ queue that runs one organization's task rules (TK4). */
export const TASK_RULES_QUEUE_NAME = 'task-rules';

/** First retry after 30 seconds, then exponential. */
const RETRY_DELAY_MS = 30_000;

let taskRulesQueue: Queue<TaskRulesJobData> | null = null;

function getTaskRulesQueue(): Queue<TaskRulesJobData> {
  if (taskRulesQueue) return taskRulesQueue;
  taskRulesQueue = new Queue<TaskRulesJobData>(TASK_RULES_QUEUE_NAME, {
    connection: getBullMQProducerConnectionOptions(),
    prefix: getBullMQKeyPrefix(),
    defaultJobOptions: {
      removeOnComplete: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
      removeOnFail: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
      attempts: 3,
      backoff: { type: 'exponential', delay: RETRY_DELAY_MS, jitter: QUEUE_RETRY_JITTER_RATIO },
    },
  });
  return taskRulesQueue;
}

/**
 * One waiting task rules job per organization (TK4), plus one more while it runs — a sweep or a
 * request that finds a job still waiting adds nothing, and a write committed while a job runs (a
 * message, a booking's status — D81 T7) is picked up by the job kept behind it rather than at the
 * next sweep.
 */
export function taskRulesDeduplication(organizationPublicId: string): DeduplicationOptions {
  return { id: `task-rules-${organizationPublicId}`, keepLastIfActive: true };
}

/**
 * Enqueues an organization's task rules job (TK4) — a unique `jobId` per add and the
 * organization's deduplication key, so a retained finished job never swallows a later add.
 *
 * @remarks
 * - **Algorithm:** validates the payload, then `queue.add` with the trace context.
 * - **Failure modes:** propagates BullMQ enqueue errors to the sweep, which logs them and goes on;
 *   the next five-minute sweep adds the organization again.
 * - **Side effects:** at most one waiting job per organization, and one more while it runs.
 */
export async function enqueueTaskRules(organizationPublicId: string): Promise<void> {
  const jobData = parseBullMQJobData({
    schema: taskRulesJobDataSchema,
    data: { organizationPublicId, ...captureTraceContextForPropagation() },
    queueName: TASK_RULES_QUEUE_NAME,
  });
  await getTaskRulesQueue().add('run-task-rules', jobData, {
    jobId: `task-rules-${organizationPublicId}-${randomUUID()}`,
    deduplication: taskRulesDeduplication(organizationPublicId),
  });
}

/**
 * {@link enqueueTaskRules} that never throws — a write's after-commit step asks for the run: a
 * booking's for the confirm request it sends (launch D78), a message's and a booking's status
 * change's so a reply or a confirm closes its task at once (D81 T7, WC-48); a Redis outage fails
 * nothing (the five-minute sweep runs it anyway).
 *
 * @remarks
 * - **Failure modes:** none — an enqueue error is logged (`task-rules.enqueue_failed`).
 */
export async function requestTaskRulesRun(organizationPublicId: string): Promise<void> {
  try {
    await enqueueTaskRules(organizationPublicId);
  } catch (error) {
    logger.warn({ error, organizationPublicId }, 'task-rules.enqueue_failed');
  }
}

/** Closes the lazily created producer queue during graceful shutdown. */
export async function closeTaskRulesQueue(): Promise<void> {
  if (taskRulesQueue) {
    await taskRulesQueue.close();
    taskRulesQueue = null;
  }
}
