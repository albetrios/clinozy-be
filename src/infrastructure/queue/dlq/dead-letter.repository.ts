import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { database } from '@/infrastructure/database/connection.js';
import { dead_letter_jobs } from '@/infrastructure/queue/dlq/dead-letter.schema.js';

/**
 * Values inserted into `audit.dead_letter_jobs` for one terminal job failure. Mirrors
 * the columns of {@link dead_letter_jobs}; `payload_summary` must already be a redacted
 * metadata summary (never raw secrets, HTML, or full webhook bodies).
 */
export interface DeadLetterJobInsert {
  source_queue: string;
  dead_letter_queue: string;
  job_id: string | null;
  job_name: string;
  payload_summary: Record<string, unknown>;
  failed_reason: string;
  error_stack: string | null;
  attempts_made: number;
  max_attempts: number;
  failed_at: Date;
  /** How many dead-letter replays led to this failure (0 = the original job). */
  replay_depth: number;
}

/**
 * Inserts one dead-letter record into `audit.dead_letter_jobs` — the durable
 * source of truth operators replay from after a job exhausts its BullMQ retries.
 *
 * @remarks
 * - **Algorithm:** a single `INSERT` against the process-wide base {@link database}
 *   handle. Worker failure hooks run outside any request/worker database context, so this
 *   infra-level write uses the base connection directly and passes every identifier
 *   explicitly (no RLS session reliance).
 * - **Failure modes:** propagates any Postgres error to the caller
 *   ({@link attachDeadLetterAndAlerting}), which captures it to Sentry rather than letting
 *   it escape the `failed` listener. The connection role is a member of `clinozy_be_app`, so
 *   the table's deny-all + `clinozy_be_app` RLS policies permit the write.
 * - **Side effects:** inserts one row; this function never updates or deletes existing rows.
 *   Auto-retry processing may later update the row's resolution marker.
 * - **Notes:** does not store raw payloads — callers pass a redacted `payload_summary`.
 */
export async function insertDeadLetterJob(record: DeadLetterJobInsert): Promise<void> {
  await database.insert(dead_letter_jobs).values({
    source_queue: record.source_queue,
    dead_letter_queue: record.dead_letter_queue,
    job_id: record.job_id,
    job_name: record.job_name,
    payload_summary: record.payload_summary,
    failed_reason: record.failed_reason,
    error_stack: record.error_stack,
    attempts_made: record.attempts_made,
    max_attempts: record.max_attempts,
    failed_at: record.failed_at,
    replay_depth: record.replay_depth,
  });
}

/** One row from `audit.dead_letter_jobs` returned for automated replay scanning. */
export type DeadLetterJobLedgerRow = {
  id: number;
  source_queue: string;
  dead_letter_queue: string;
  job_id: string | null;
  job_name: string;
  payload_summary: Record<string, unknown>;
  attempts_made: number;
  failed_at: Date;
  replay_depth: number;
};

/**
 * Lists ledger rows waiting for the auto-retry sweeper: unhandled, from the given source queues,
 * failed at least the cooldown ago.
 *
 * @remarks
 * - **Algorithm:** filters by `source_queue`, `failed_at <= failedBefore` and an unset
 *   `auto_retry_resolved_at`, oldest first, capped by `limit`. The caller passes only the queues
 *   whose outbound circuit is closed, so rows of a queue that cannot replay yet do not hold the
 *   head of the scan.
 * - **Failure modes:** propagates Postgres errors to the caller.
 * - **Side effects:** read-only.
 * - **Notes:** uses the base database connection independently of any pinned context.
 *   The system table has FORCE RLS with role-based access policies and does not
 *   require tenant/user session GUCs.
 */
export async function findDeadLetterJobsForAutoRetry(input: {
  sourceQueues: readonly string[];
  failedBefore: Date;
  limit: number;
}): Promise<DeadLetterJobLedgerRow[]> {
  if (input.sourceQueues.length === 0 || input.limit <= 0) return [];

  return database
    .select({
      id: dead_letter_jobs.id,
      source_queue: dead_letter_jobs.source_queue,
      dead_letter_queue: dead_letter_jobs.dead_letter_queue,
      job_id: dead_letter_jobs.job_id,
      job_name: dead_letter_jobs.job_name,
      payload_summary: dead_letter_jobs.payload_summary,
      attempts_made: dead_letter_jobs.attempts_made,
      failed_at: dead_letter_jobs.failed_at,
      replay_depth: dead_letter_jobs.replay_depth,
    })
    .from(dead_letter_jobs)
    .where(
      and(
        inArray(dead_letter_jobs.source_queue, [...input.sourceQueues]),
        lte(dead_letter_jobs.failed_at, input.failedBefore),
        // Exclude rows already handled (replayed, not replayable, at the depth limit) so they can
        // never hold the head of the scan or replay twice.
        isNull(dead_letter_jobs.auto_retry_resolved_at),
      ),
    )
    .orderBy(asc(dead_letter_jobs.failed_at))
    .limit(input.limit)
    .then((rows) =>
      rows.map((row) => ({
        ...row,
        payload_summary: row.payload_summary as Record<string, unknown>,
      })),
    );
}

/**
 * Marks a dead-letter ledger row as handled by the auto-retry sweeper — replayed, not replayable,
 * or at the replay-depth limit — removing it from {@link findDeadLetterJobsForAutoRetry} so it
 * can never re-enter the scan or replay twice. Idempotent (only stamps a NULL marker).
 */
export async function markDeadLetterJobAutoRetryResolved(id: number): Promise<void> {
  await database
    .update(dead_letter_jobs)
    .set({ auto_retry_resolved_at: new Date() })
    .where(and(eq(dead_letter_jobs.id, id), isNull(dead_letter_jobs.auto_retry_resolved_at)));
}
