/** Shared BullMQ job-options policy applied across event-driven domain producer queues. */

/**
 * Completed/failed BullMQ jobs retained per event-driven domain queue (count cap).
 *
 * @remarks
 * Bounds how many finished jobs each producer queue (`stripe-webhook`, `notification`,
 * `webhook-delivery`, `user-data-export`, `mail`) keeps in Redis for observability before
 * eviction; paired with the seven-day (`SEVEN_DAYS_SECONDS`) age cap at each call site. This is
 * the default for high-throughput domain queues — the scheduler's repeatable jobs and the
 * dead-letter queue intentionally use their own counts/ages and do not consume this value.
 */
export const DEFAULT_JOB_RETENTION_COUNT = 1_000;

/**
 * Share of a retry delay added as random jitter (BullMQ's `jitter` on the built-in exponential
 * backoff; `addRetryJitter` on the custom ones).
 *
 * @remarks
 * Without it every job that failed together retries together: when a dependency's circuit opens,
 * each failing job waits exactly the circuit's remaining open time, and the whole backlog hits the
 * half-open probe at once and opens it again. 20% decorrelates them without stretching the
 * schedule noticeably.
 */
export const QUEUE_RETRY_JITTER_RATIO = 0.2;
