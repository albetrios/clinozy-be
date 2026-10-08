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
import {
  type DayCloseAutoCloseJobData,
  dayCloseAutoCloseJobDataSchema,
} from './day-close-auto-close.job.schema.js';

/** BullMQ queue that closes one organization's past days nobody closed (WC-39, B26). */
export const DAY_CLOSE_AUTO_CLOSE_QUEUE_NAME = 'day-close-auto-close';

/** First retry after 30 seconds, then exponential. */
const RETRY_DELAY_MS = 30_000;

let dayCloseAutoCloseQueue: Queue<DayCloseAutoCloseJobData> | null = null;

function getDayCloseAutoCloseQueue(): Queue<DayCloseAutoCloseJobData> {
  if (dayCloseAutoCloseQueue) return dayCloseAutoCloseQueue;
  dayCloseAutoCloseQueue = new Queue<DayCloseAutoCloseJobData>(DAY_CLOSE_AUTO_CLOSE_QUEUE_NAME, {
    connection: getBullMQProducerConnectionOptions(),
    prefix: getBullMQKeyPrefix(),
    defaultJobOptions: {
      removeOnComplete: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
      removeOnFail: { count: DEFAULT_JOB_RETENTION_COUNT, age: SEVEN_DAYS_SECONDS },
      attempts: 3,
      backoff: { type: 'exponential', delay: RETRY_DELAY_MS, jitter: QUEUE_RETRY_JITTER_RATIO },
    },
  });
  return dayCloseAutoCloseQueue;
}

/**
 * One live auto-close job per organization (B26) — a sweep that finds it still waiting adds nothing,
 * and the next sweep adds a fresh one once it finished.
 */
export function dayCloseAutoCloseDeduplication(organizationPublicId: string): DeduplicationOptions {
  return { id: `day-close-auto-close-${organizationPublicId}` };
}

/**
 * Enqueues an organization's auto-close job (WC-39) — a unique `jobId` per add and the
 * organization's deduplication key, so a retained finished job never swallows a later add.
 *
 * @remarks
 * - **Algorithm:** validates the payload, then `queue.add` with the trace context.
 * - **Failure modes:** propagates BullMQ enqueue errors to the sweep, which logs them and goes on;
 *   the next hourly sweep finds the organization again (its days are still open).
 * - **Side effects:** at most one job on the queue per organization at a time.
 */
export async function enqueueDayCloseAutoClose(organizationPublicId: string): Promise<void> {
  const jobData = parseBullMQJobData(
    dayCloseAutoCloseJobDataSchema,
    { organizationPublicId, ...captureTraceContextForPropagation() },
    DAY_CLOSE_AUTO_CLOSE_QUEUE_NAME,
  );
  await getDayCloseAutoCloseQueue().add('auto-close-past-days', jobData, {
    jobId: `day-close-auto-close-${organizationPublicId}-${randomUUID()}`,
    deduplication: dayCloseAutoCloseDeduplication(organizationPublicId),
  });
}

/** Closes the lazily created producer queue during graceful shutdown. */
export async function closeDayCloseAutoCloseQueue(): Promise<void> {
  if (dayCloseAutoCloseQueue) {
    await dayCloseAutoCloseQueue.close();
    dayCloseAutoCloseQueue = null;
  }
}
