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
 * One live task rules job per organization (TK4) — a sweep that finds it still waiting adds
 * nothing, and the next sweep adds a fresh one once it finished.
 */
export function taskRulesDeduplication(organizationPublicId: string): DeduplicationOptions {
  return { id: `task-rules-${organizationPublicId}` };
}

/**
 * Enqueues an organization's task rules job (TK4) — a unique `jobId` per add and the
 * organization's deduplication key, so a retained finished job never swallows a later add.
 *
 * @remarks
 * - **Algorithm:** validates the payload, then `queue.add` with the trace context.
 * - **Failure modes:** propagates BullMQ enqueue errors to the sweep, which logs them and goes on;
 *   the next five-minute sweep adds the organization again.
 * - **Side effects:** at most one job on the queue per organization at a time.
 */
export async function enqueueTaskRules(organizationPublicId: string): Promise<void> {
  const jobData = parseBullMQJobData(
    taskRulesJobDataSchema,
    { organizationPublicId, ...captureTraceContextForPropagation() },
    TASK_RULES_QUEUE_NAME,
  );
  await getTaskRulesQueue().add('run-task-rules', jobData, {
    jobId: `task-rules-${organizationPublicId}-${randomUUID()}`,
    deduplication: taskRulesDeduplication(organizationPublicId),
  });
}

/**
 * {@link enqueueTaskRules} that never throws — a booking's after-commit step asks for the run that
 * sends its confirm request (launch D78); a Redis outage fails nothing (the five-minute sweep
 * runs it anyway).
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
