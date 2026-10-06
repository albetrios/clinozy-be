/** BullMQ queue name — repeatable schedule: `src/infrastructure/queue/scheduler.ts`. */
export const DLQ_AUTO_RETRY_QUEUE_NAME = 'dlq-auto-retry';

/** Default cron: every 15 minutes (aligned with DLQ depth sampling). */
export const DEFAULT_DLQ_AUTO_RETRY_CRON = '*/15 * * * *';
