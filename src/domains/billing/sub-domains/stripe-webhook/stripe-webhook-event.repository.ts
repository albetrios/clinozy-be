import { and, asc, eq, gte, inArray, lt, ne, or, sql } from 'drizzle-orm';
import {
  assertWorkerDatabaseContext,
  getRequestDatabase,
  isWorkerRuntime,
} from '@/infrastructure/database/contexts/database-context-runtime.js';
import {
  MILLISECONDS_PER_MINUTE,
  STRIPE_WEBHOOK_FAILED_COUNT_CAP,
  STRIPE_WEBHOOK_MAX_PROCESSING_ATTEMPTS,
  STRIPE_WEBHOOK_STUCK_PROCESSING_LEASE_MINUTES,
} from '@/shared/constants/index.js';
import {
  stripe_subscription_tombstones,
  stripe_webhook_events,
  type StripeWebhookProcessingStatus,
} from './stripe-webhook.schema.js';

/** Max characters persisted for a Stripe webhook failure reason (bounds ledger storage). */
const FAILURE_REASON_MAX_LENGTH = 2000;

function truncateFailureReason(failure_reason: string): string {
  return failure_reason.length > FAILURE_REASON_MAX_LENGTH
    ? failure_reason.slice(0, FAILURE_REASON_MAX_LENGTH)
    : failure_reason;
}

/** `failed`, or `processing` past the stuck lease — the rows a reclaim may pick up. */
function reclaimableStatusCondition(stuckProcessingBefore: Date) {
  return or(
    eq(stripe_webhook_events.processing_status, 'failed'),
    and(
      eq(stripe_webhook_events.processing_status, 'processing'),
      lt(stripe_webhook_events.updated_at, stuckProcessingBefore),
    ),
  );
}

/**
 * Outcome of {@link StripeWebhookEventRepository.tryClaimEvent}: `claimed` for a
 * brand-new event, `processed_duplicate` for an at-least-once redelivery,
 * `reclaimed` when a previously failed or stuck-processing row was retried,
 * `abandoned` when the event was given up on (never retried on its own), and
 * `still_processing_within_lease` when another worker is actively processing the
 * event and the caller must back off.
 */
export type StripeWebhookEventClaimResult =
  | 'claimed'
  | 'processed_duplicate'
  | 'reclaimed'
  | 'abandoned'
  | 'still_processing_within_lease';

/**
 * What the HTTP ingress found for an event: it wrote the ledger row (`recorded`), the row was
 * already there and still to be processed (`already_recorded`), or it is terminal.
 */
export type StripeWebhookIngressResult =
  | 'recorded'
  | 'already_recorded'
  | 'processed_duplicate'
  | 'abandoned';

function stripeWebhookLedgerDatabase() {
  if (isWorkerRuntime()) {
    assertWorkerDatabaseContext(['system_table']);
  }
  return getRequestDatabase();
}

/**
 * Database handle for the `billing.stripe_subscription_tombstones` system table.
 * Allows both the `system_table` and `organization` worker contexts because the
 * tombstone is written/read from inside the per-event organization dispatch
 * (BILL-03) as well as standalone system flows. The table carries a deny-all +
 * app-role RLS policy (migrations/20260614130000_*) — it is keyed by Stripe id,
 * not tenant, so it is a system table by design and neither context can leak
 * across tenants.
 */
function stripeSubscriptionTombstoneDatabase() {
  if (isWorkerRuntime()) {
    assertWorkerDatabaseContext(['system_table', 'organization']);
  }
  return getRequestDatabase();
}

/**
 * Append-mostly ledger access for the `billing.stripe_webhook_events` system
 * table that backs at-least-once Stripe delivery idempotency.
 *
 * @remarks
 * - **Algorithm:** {@link tryClaimEvent} attempts an `INSERT ... ON CONFLICT DO
 *   NOTHING` to atomically reserve the event id, falling back to a status read
 *   that classifies duplicates, stuck-processing leases, and reclaim windows.
 *   {@link tryReclaimEvent} flips a `failed` or stale-`processing` row back to
 *   `processing` (incrementing `attempt_count`) so the worker can retry safely.
 * - **Failure modes:** Returning `still_processing_within_lease` signals the
 *   caller to defer; the in-process service raises `ConflictError` on that
 *   outcome. `markFailed` truncates failure reasons to 2,000 characters.
 * - **Side effects:** All writes happen on a worker-context handle when running
 *   under {@link isWorkerRuntime}; otherwise on the request-scoped database.
 *   Reclaim sweeps touch up to `batchSize` rows per invocation.
 * - **Notes:** The ledger row is the source of truth for delivery state and is
 *   intentionally separate from any business-side subscription mutations.
 */
export class StripeWebhookEventRepository {
  /**
   * The HTTP ingress's durability write: inserts the ledger row, or classifies the one already there
   * — and never claims it. Claiming is the worker's: an ingress that reclaimed a row still waiting
   * for its first run (a Stripe redelivery) spent that first claim, and the worker then found the
   * event "in flight" and backed off until the stuck-processing lease expired (15–20 minutes).
   */
  async recordAtIngress(input: {
    stripe_event_id: string;
    event_type: string;
    stripe_created_at: Date;
    request_id?: string;
  }): Promise<StripeWebhookIngressResult> {
    const insertedRows = await stripeWebhookLedgerDatabase()
      .insert(stripe_webhook_events)
      .values({
        stripe_event_id: input.stripe_event_id,
        event_type: input.event_type,
        stripe_created_at: input.stripe_created_at,
        processing_status: 'processing',
        request_id: input.request_id,
        attempt_count: 0,
      })
      .onConflictDoNothing()
      .returning({ stripe_event_id: stripe_webhook_events.stripe_event_id });
    if (insertedRows.length > 0) return 'recorded';

    const [existing] = await stripeWebhookLedgerDatabase()
      .select({ processing_status: stripe_webhook_events.processing_status })
      .from(stripe_webhook_events)
      .where(eq(stripe_webhook_events.stripe_event_id, input.stripe_event_id))
      .limit(1);
    if (existing?.processing_status === 'processed') return 'processed_duplicate';
    if (existing?.processing_status === 'abandoned') return 'abandoned';
    return 'already_recorded';
  }

  async tryClaimEvent(input: {
    stripe_event_id: string;
    event_type: string;
    stripe_created_at: Date;
    request_id?: string;
  }): Promise<StripeWebhookEventClaimResult> {
    const insertedRows = await stripeWebhookLedgerDatabase()
      .insert(stripe_webhook_events)
      .values({
        stripe_event_id: input.stripe_event_id,
        event_type: input.event_type,
        stripe_created_at: input.stripe_created_at,
        processing_status: 'processing',
        request_id: input.request_id,
        attempt_count: 0,
      })
      .onConflictDoNothing()
      .returning({ stripe_event_id: stripe_webhook_events.stripe_event_id });

    if (insertedRows.length > 0) {
      return 'claimed';
    }

    const existingRows = await stripeWebhookLedgerDatabase()
      .select({
        processing_status: stripe_webhook_events.processing_status,
      })
      .from(stripe_webhook_events)
      .where(eq(stripe_webhook_events.stripe_event_id, input.stripe_event_id))
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      return 'still_processing_within_lease';
    }

    if (existing.processing_status === 'processed') {
      return 'processed_duplicate';
    }
    if (existing.processing_status === 'abandoned') {
      return 'abandoned';
    }

    const reclaimed = await this.tryReclaimEvent(input.stripe_event_id);
    if (reclaimed) {
      return 'reclaimed';
    }

    return 'still_processing_within_lease';
  }

  /**
   * Re-claim a failed or stuck-processing ledger row for retry.
   *
   * @remarks
   * Three reclaim conditions are recognised:
   *   1. status='failed' — a prior worker attempt threw; safe to retry.
   *   2. status='processing' AND updated_at older than the stuck-lease window — a
   *      worker that was processing this row has likely crashed or stalled; safe
   *      to retry (the previous worker's writes will fail-on-RETURNING once it
   *      revives).
   *   3. status='processing' AND attempt_count=0 — sec-B finding #6: the HTTP
   *      ingress committed the durability row but the worker is the first to
   *      actually dispatch. Atomicity of the UPDATE (which bumps attempt_count
   *      to 1) guarantees only one worker can win this transition; a concurrent
   *      retry that arrived seconds later will see attempt_count=1 and
   *      updated_at fresh, neither matches, and gets `still_processing_within_lease`.
   * A row that has used {@link STRIPE_WEBHOOK_MAX_PROCESSING_ATTEMPTS} is never reclaimed: the
   * reclaim sweep abandons it instead ({@link abandonExhaustedEvents}).
   */
  async tryReclaimEvent(stripe_event_id: string): Promise<boolean> {
    const stuckProcessingBefore = new Date(
      Date.now() - STRIPE_WEBHOOK_STUCK_PROCESSING_LEASE_MINUTES * MILLISECONDS_PER_MINUTE,
    );

    const rows = await stripeWebhookLedgerDatabase()
      .update(stripe_webhook_events)
      .set({
        processing_status: 'processing' satisfies StripeWebhookProcessingStatus,
        attempt_count: sql`${stripe_webhook_events.attempt_count} + 1`,
        updated_at: sql`NOW()`,
        failure_reason: null,
        processed_at: null,
      })
      .where(
        and(
          eq(stripe_webhook_events.stripe_event_id, stripe_event_id),
          lt(stripe_webhook_events.attempt_count, STRIPE_WEBHOOK_MAX_PROCESSING_ATTEMPTS),
          or(
            eq(stripe_webhook_events.processing_status, 'failed'),
            and(
              eq(stripe_webhook_events.processing_status, 'processing'),
              lt(stripe_webhook_events.updated_at, stuckProcessingBefore),
            ),
            and(
              eq(stripe_webhook_events.processing_status, 'processing'),
              eq(stripe_webhook_events.attempt_count, 0),
            ),
          ),
        ),
      )
      .returning({ stripe_event_id: stripe_webhook_events.stripe_event_id });

    return rows.length > 0;
  }

  async markProcessed(stripe_event_id: string): Promise<boolean> {
    // sec-new-D2: return whether a row was actually updated so the caller can
    // detect and log a no-op (e.g. the ledger row was unexpectedly absent).
    const rows = await stripeWebhookLedgerDatabase()
      .update(stripe_webhook_events)
      .set({
        processing_status: 'processed' satisfies StripeWebhookProcessingStatus,
        processed_at: new Date(),
        updated_at: sql`NOW()`,
      })
      .where(eq(stripe_webhook_events.stripe_event_id, stripe_event_id))
      .returning({ stripe_event_id: stripe_webhook_events.stripe_event_id });
    return rows.length > 0;
  }

  /**
   * Counts `failed` ledger rows for the reclaim worker's alert gauge, capped at
   * {@link STRIPE_WEBHOOK_FAILED_COUNT_CAP} (audit #15).
   *
   * @remarks
   * - **Algorithm:** counts over a `LIMIT cap` sub-select so Postgres stops
   *   scanning the `failed` slice once `cap` rows are seen. The partial index
   *   `idx_stripe_webhook_events_reclaimable` (`WHERE processing_status IN
   *   ('failed','processing')`) makes this an index-only scan of the small
   *   working set rather than the whole — possibly multi-million-row — ledger.
   * - **Failure modes:** propagates Postgres errors to the periodic refresh,
   *   which logs and retries on the next sweep.
   * - **Side effects:** none — pure read.
   * - **Notes:** the gauge only drives a "failed rows are lingering" alert, so a
   *   value pinned at the cap is operationally equivalent to the true count; the
   *   cap exists purely to bound the worst-case scan during a Stripe outage.
   */
  async countFailedEvents(): Promise<number> {
    const rows = await stripeWebhookLedgerDatabase()
      .select({ count: sql<number>`count(*)::int` })
      .from(
        stripeWebhookLedgerDatabase()
          .select({ one: sql<number>`1`.as('one') })
          .from(stripe_webhook_events)
          .where(eq(stripe_webhook_events.processing_status, 'failed'))
          .limit(STRIPE_WEBHOOK_FAILED_COUNT_CAP)
          .as('capped_failed_events'),
      );
    return rows[0]?.count ?? 0;
  }

  async findReclaimableStripeEventIds(limit: number): Promise<string[]> {
    const stuckProcessingBefore = new Date(
      Date.now() - STRIPE_WEBHOOK_STUCK_PROCESSING_LEASE_MINUTES * MILLISECONDS_PER_MINUTE,
    );

    const rows = await stripeWebhookLedgerDatabase()
      .select({ stripe_event_id: stripe_webhook_events.stripe_event_id })
      .from(stripe_webhook_events)
      .where(
        and(
          lt(stripe_webhook_events.attempt_count, STRIPE_WEBHOOK_MAX_PROCESSING_ATTEMPTS),
          reclaimableStatusCondition(stuckProcessingBefore),
        ),
      )
      .orderBy(asc(stripe_webhook_events.updated_at))
      .limit(limit);

    return rows.map((row) => row.stripe_event_id);
  }

  /**
   * Abandons the reclaimable rows that used every processing attempt — a handler that kept
   * failing, or a worker that kept dying mid-event — and returns their ids and failure reasons.
   *
   * @remarks
   * - **Algorithm:** one `UPDATE ... RETURNING` over `failed` / stale-`processing` rows with
   *   `attempt_count >= STRIPE_WEBHOOK_MAX_PROCESSING_ATTEMPTS`, at most `limit`.
   * - **Failure modes:** propagates Postgres errors to the sweep, which retries next tick.
   * - **Side effects:** flips each row to `abandoned`; the caller alerts once per returned row.
   * - **Notes:** the worker abandons a row itself when its last attempt fails; this catches the
   *   rows whose attempts ran out without a recorded failure (a crash loop).
   */
  async abandonExhaustedEvents(
    limit: number,
  ): Promise<{ stripe_event_id: string; failure_reason: string | null }[]> {
    const stuckProcessingBefore = new Date(
      Date.now() - STRIPE_WEBHOOK_STUCK_PROCESSING_LEASE_MINUTES * MILLISECONDS_PER_MINUTE,
    );
    const exhaustedRows = stripeWebhookLedgerDatabase()
      .select({ stripe_event_id: stripe_webhook_events.stripe_event_id })
      .from(stripe_webhook_events)
      .where(
        and(
          gte(stripe_webhook_events.attempt_count, STRIPE_WEBHOOK_MAX_PROCESSING_ATTEMPTS),
          reclaimableStatusCondition(stuckProcessingBefore),
        ),
      )
      .limit(limit);
    return stripeWebhookLedgerDatabase()
      .update(stripe_webhook_events)
      .set({
        processing_status: 'abandoned' satisfies StripeWebhookProcessingStatus,
        processed_at: new Date(),
        updated_at: sql`NOW()`,
      })
      .where(inArray(stripe_webhook_events.stripe_event_id, exhaustedRows))
      .returning({
        stripe_event_id: stripe_webhook_events.stripe_event_id,
        failure_reason: stripe_webhook_events.failure_reason,
      });
  }

  /**
   * Abandons one event — a failure no retry can fix, or its last attempt failed. Never touches a
   * `processed` row. Returns whether a row changed.
   */
  async markAbandoned(stripe_event_id: string, failure_reason: string): Promise<boolean> {
    const rows = await stripeWebhookLedgerDatabase()
      .update(stripe_webhook_events)
      .set({
        processing_status: 'abandoned' satisfies StripeWebhookProcessingStatus,
        processed_at: new Date(),
        failure_reason: truncateFailureReason(failure_reason),
        updated_at: sql`NOW()`,
      })
      .where(
        and(
          eq(stripe_webhook_events.stripe_event_id, stripe_event_id),
          ne(stripe_webhook_events.processing_status, 'processed'),
        ),
      )
      .returning({ stripe_event_id: stripe_webhook_events.stripe_event_id });
    return rows.length > 0;
  }

  /**
   * Gives a `failed` or `abandoned` event a fresh attempt budget for an operator retry: back to
   * `failed` with `attempt_count` 0, so the next claim reclaims it. Returns whether a row changed.
   */
  async resetForOperatorRetry(stripe_event_id: string): Promise<boolean> {
    const rows = await stripeWebhookLedgerDatabase()
      .update(stripe_webhook_events)
      .set({
        processing_status: 'failed' satisfies StripeWebhookProcessingStatus,
        attempt_count: 0,
        updated_at: sql`NOW()`,
      })
      .where(
        and(
          eq(stripe_webhook_events.stripe_event_id, stripe_event_id),
          inArray(stripe_webhook_events.processing_status, ['failed', 'abandoned']),
        ),
      )
      .returning({ stripe_event_id: stripe_webhook_events.stripe_event_id });
    return rows.length > 0;
  }

  /**
   * Returns the subset of `stripeEventIds` already present in the ledger.
   *
   * @remarks
   * - **Algorithm:** single `WHERE stripe_event_id IN (...)` read; empty input short-circuits to an
   *   empty set without a query.
   * - **Failure modes:** propagates SELECT errors to the caller (the catch-up sweep logs + retries).
   * - **Side effects:** none — pure read.
   * - **Notes:** the catch-up processor diffs a Stripe `events.list` page against this set and
   *   enqueues only the missing ids, recovering events that never reached the ledger.
   */
  async findExistingStripeEventIds(stripeEventIds: string[]): Promise<Set<string>> {
    if (stripeEventIds.length === 0) {
      return new Set();
    }
    const rows = await stripeWebhookLedgerDatabase()
      .select({ stripe_event_id: stripe_webhook_events.stripe_event_id })
      .from(stripe_webhook_events)
      .where(inArray(stripe_webhook_events.stripe_event_id, stripeEventIds));
    return new Set(rows.map((row) => row.stripe_event_id));
  }

  /**
   * Scans the ledger for reclaimable rows (failed, or processing past the
   * stuck-lease window) and returns their stripe_event_ids without mutating
   * the rows.
   *
   * @remarks
   * - **sec-re-02:** Prior to this fix, the sweep called
   *   {@link tryReclaimEvent} inline, which bumped `processing_status` to
   *   `processing`, incremented `attempt_count` and refreshed `updated_at`.
   *   The worker's subsequent `tryClaimEvent` → `tryReclaimEvent` then found
   *   all three reclaim branches false (not failed, not stale, not
   *   attempt_count = 0), returned `still_processing_within_lease`, BullMQ
   *   retried 5× and DLQ'd, and — combined with sec-Q #1's seven-day
   *   failed-job retention — the next sweep's re-enqueue became a silent
   *   duplicate-jobId no-op. The row was stuck in `processing` permanently.
   *   Returning just the candidate ids and letting the worker call
   *   `tryClaimEvent` → `tryReclaimEvent` itself preserves the atomic
   *   transition semantics in one place (the worker) and re-arms the
   *   failed → processing branch.
   * - **Failure modes:** none beyond a transient SELECT error, which the
   *   caller logs and retries on the next sweep.
   * - **Side effects:** none — pure read.
   * - **Notes:** the cron processor pairs this with
   *   `enqueueStripeWebhookByEventIdForReclaim` (fresh jobId per attempt) so
   *   the BullMQ dedup does not block the re-enqueue.
   */
  async sweepReclaimableEvents(batchSize: number): Promise<{
    scannedCount: number;
    candidateStripeEventIds: string[];
  }> {
    const candidateStripeEventIds = await this.findReclaimableStripeEventIds(batchSize);
    return {
      scannedCount: candidateStripeEventIds.length,
      candidateStripeEventIds,
    };
  }

  /**
   * Records a failed processing attempt and returns the row's attempt count — the caller abandons
   * the event once it reaches {@link STRIPE_WEBHOOK_MAX_PROCESSING_ATTEMPTS}. `null` when no row
   * matched (sec-new-D2: the caller logs the no-op).
   */
  async markFailed(
    stripe_event_id: string,
    failure_reason: string,
  ): Promise<{ attemptCount: number } | null> {
    const rows = await stripeWebhookLedgerDatabase()
      .update(stripe_webhook_events)
      .set({
        processing_status: 'failed' satisfies StripeWebhookProcessingStatus,
        processed_at: new Date(),
        failure_reason: truncateFailureReason(failure_reason),
        updated_at: sql`NOW()`,
      })
      .where(eq(stripe_webhook_events.stripe_event_id, stripe_event_id))
      .returning({ attemptCount: stripe_webhook_events.attempt_count });
    return rows[0] ?? null;
  }

  /**
   * Resolves the owning organization's public id for a Stripe subscription via
   * the `billing.resolve_organization_public_id_for_stripe_subscription`
   * SECURITY DEFINER resolver. Used by the Stripe webhook handler to pin
   * `app.current_organization_public_id` before mutating tenant-scoped billing rows.
   *
   * @remarks
   * Architecturally this belongs on the repository rather than as ad-hoc
   * `sql\`\`` in a util because (a) it accesses Postgres directly, and (b) the
   * util layer is forbidden from importing the raw `sql` template by
   * architecture rule (services and utils call repositories; repositories own
   * the DB connection). Returns `undefined` when the resolver finds no row,
   * letting the caller decide whether to throw or skip based on the event type.
   */
  async resolveOrganizationPublicIdByProviderSubscriptionId(
    provider_subscription_id: string,
  ): Promise<string | undefined> {
    const rows = await stripeWebhookLedgerDatabase().execute(
      sql`SELECT billing.resolve_organization_public_id_for_stripe_subscription(${provider_subscription_id}) AS public_id`,
    );
    const resultRows = ((rows as { rows?: unknown[] }).rows ?? rows) as Array<{
      public_id: string | null;
    }>;
    const organizationPublicId = resultRows[0]?.public_id;
    return organizationPublicId ?? undefined;
  }

  /**
   * Resolves the owning organization's public id for a Stripe **customer** via
   * the `billing.resolve_organization_public_id_for_stripe_customer` SECURITY
   * DEFINER resolver (audit #2). The customer mapping is the authoritative
   * fallback for a `customer.subscription.created` event whose provider
   * subscription id is not yet persisted locally — the local subscription row
   * carries `provider_customer_id` from the moment the service creates it, so
   * the customer id binds the event to a tenant even before the subscription id
   * is mapped.
   *
   * @remarks
   * Mirrors {@link resolveOrganizationPublicIdByProviderSubscriptionId}: the
   * lookup lives on the repository because the util layer is forbidden from
   * importing the raw `sql` template (architecture rule). Each organization gets its own
   * Stripe customer, so the mapping is unambiguous; `LIMIT 1` in the resolver
   * tolerates an organization holding several subscription rows for the same customer
   * (e.g. a canceled row plus a re-subscribed row). Returns `undefined` when no
   * row maps the customer, letting the caller fail closed rather than trust
   * attacker-influencable Stripe metadata.
   */
  async resolveOrganizationPublicIdByStripeCustomerId(
    provider_customer_id: string,
  ): Promise<string | undefined> {
    const rows = await stripeWebhookLedgerDatabase().execute(
      sql`SELECT billing.resolve_organization_public_id_for_stripe_customer(${provider_customer_id}) AS public_id`,
    );
    const resultRows = ((rows as { rows?: unknown[] }).rows ?? rows) as Array<{
      public_id: string | null;
    }>;
    const organizationPublicId = resultRows[0]?.public_id;
    return organizationPublicId ?? undefined;
  }

  /**
   * Records (or advances) the deletion watermark for a Stripe subscription id
   * (BILL-03). Idempotent: keeps the latest `deleted_event_created_at` via
   * `GREATEST` so an out-of-order older delete cannot lower the watermark.
   *
   * @remarks
   * - **Algorithm:** `INSERT ... ON CONFLICT (provider_subscription_id) DO UPDATE`
   *   with `GREATEST(existing, incoming)`.
   * - **Failure modes:** propagates Postgres errors.
   * - **Side effects:** writes the RLS-free `billing.stripe_subscription_tombstones`
   *   table; safe to call from the per-event organization dispatch.
   * - **Notes:** called only when a `customer.subscription.deleted` finds no local
   *   subscription row to cancel (delete arrived before create).
   */
  async recordSubscriptionDeletionTombstone(
    provider_subscription_id: string,
    deleted_event_created_at: Date,
  ): Promise<void> {
    // The raw `sql` template binds parameters as they are, without the column's date
    // mapping, so the GREATEST() template gets an unambiguous UTC ISO string. The Drizzle
    // `.values()` path still gets the `Date` (the date-mode timestamptz column maps it).
    const deleted_at_iso = deleted_event_created_at.toISOString();
    await stripeSubscriptionTombstoneDatabase()
      .insert(stripe_subscription_tombstones)
      .values({ provider_subscription_id, deleted_event_created_at })
      .onConflictDoUpdate({
        target: stripe_subscription_tombstones.provider_subscription_id,
        set: {
          deleted_event_created_at: sql`GREATEST(${stripe_subscription_tombstones.deleted_event_created_at}, ${deleted_at_iso}::timestamptz)`,
          updated_at: sql`NOW()`,
        },
      });
  }

  /**
   * Returns the recorded deletion watermark for a Stripe subscription id, or
   * `null` when none exists (BILL-03).
   *
   * @remarks
   * - **Algorithm:** single-row primary-key lookup.
   * - **Failure modes:** propagates Postgres errors.
   * - **Side effects:** none — read-only.
   * - **Notes:** the create/update handler compares this against the incoming
   *   event timestamp to refuse a stale create that would resurrect entitlement.
   */
  async findSubscriptionDeletionTombstone(
    provider_subscription_id: string,
  ): Promise<{ deleted_event_created_at: Date } | null> {
    const rows = await stripeSubscriptionTombstoneDatabase()
      .select({
        deleted_event_created_at: stripe_subscription_tombstones.deleted_event_created_at,
      })
      .from(stripe_subscription_tombstones)
      .where(eq(stripe_subscription_tombstones.provider_subscription_id, provider_subscription_id))
      .limit(1);
    return rows[0] ?? null;
  }
}
