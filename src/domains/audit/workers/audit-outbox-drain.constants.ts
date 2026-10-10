/** BullMQ queue name — repeatable schedule: `src/infrastructure/queue/scheduler.ts`. */
export const AUDIT_OUTBOX_DRAIN_QUEUE_NAME = 'audit-outbox-drain';

/** Default cron — every 30 seconds. Tunable via `AUDIT_OUTBOX_DRAIN_CRON`. */
export const DEFAULT_AUDIT_OUTBOX_DRAIN_CRON = '*/30 * * * * *';

/** Rows per drain batch. Override via `AUDIT_OUTBOX_DRAIN_BATCH_SIZE`. */
export const DEFAULT_AUDIT_OUTBOX_DRAIN_BATCH_SIZE = 500;

/** Per-row attempt cap; after this many failures the row is marked FAILED for operator triage. */
export const DEFAULT_AUDIT_OUTBOX_DRAIN_MAX_ATTEMPTS = 5;

/**
 * Hours a drained (PROCESSED) outbox row is kept before the drain deletes it: `audit.logs` holds the
 * record, and the copy — actor, IP, user agent, metadata — is only for a day of debugging.
 */
export const AUDIT_OUTBOX_PROCESSED_RETENTION_HOURS = 24;

/** Most finished outbox rows one drain pass deletes per status — bounds the pass. */
export const AUDIT_OUTBOX_PRUNE_BATCH_SIZE = 1_000;

/**
 * Backstop threshold (sec-r7/M2): if the oldest still-PENDING outbox row is older than this many
 * seconds at the end of a drain pass, emit `audit.outbox.drain.backlog.stalled` so a wedged or
 * chronically-failing queue pages an operator even though the per-row attempt cap now bounds
 * retries. 15 minutes is comfortably above the 30s drain cadence × max-attempts, so it only fires
 * on a genuine stall, not transient backlog.
 */
export const AUDIT_OUTBOX_DRAIN_STALE_PENDING_WARN_SECONDS = 15 * 60;
