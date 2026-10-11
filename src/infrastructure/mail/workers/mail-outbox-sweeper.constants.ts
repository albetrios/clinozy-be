/** BullMQ queue name — repeatable schedule: `src/infrastructure/queue/scheduler.ts`. */
export const MAIL_OUTBOX_SWEEPER_QUEUE_NAME = 'mail-outbox-sweeper';

/**
 * Multiplier applied to the `sending`-reclaim window when the Resend circuit breaker is OPEN.
 * Rows stuck in `sending` while Resend is down are stuck *because* the provider is failing, not
 * because the job was lost — reclaiming and re-enqueuing them just amplifies load on an already
 * struggling provider. Widening the window holds them until the circuit recovers.
 */
export const MAIL_OUTBOX_RECLAIM_CIRCUIT_OPEN_MULTIPLIER = 2;

/**
 * Days a finished (`sent` / `failed`) mail outbox row is kept before the sweeper deletes it: the row
 * holds the recipient and subject of every email sent.
 */
export const MAIL_OUTBOX_FINISHED_RETENTION_DAYS = 30;

/** Most finished mail outbox rows one sweep deletes — bounds the pass. */
export const MAIL_OUTBOX_PRUNE_BATCH_SIZE = 1_000;
