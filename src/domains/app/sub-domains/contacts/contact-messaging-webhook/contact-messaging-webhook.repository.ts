import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import {
  assertWorkerDatabaseContext,
  getContextFreeDatabase,
  getRequestDatabase,
} from '@/infrastructure/database/contexts/database-context-runtime.js';
import { deleteInBatchesByCondition } from '@/infrastructure/database/utils/batch-delete.util.js';
import type { WorkerDatabaseHandle } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import {
  MESSAGING_WEBHOOK_EVENT_CLAIM_STALE_MINUTES,
  MESSAGING_WEBHOOK_EVENT_MAX_ATTEMPTS,
  MESSAGING_WEBHOOK_EVENT_RETENTION_DAYS,
  MESSAGING_WEBHOOK_EVENT_STATUS,
  type MessagingWebhookChannel,
} from './contact-messaging-webhook.constants.js';
import { messaging_webhook_events } from './contact-messaging-webhook.schema.js';
import type { MessagingWebhookUpdate } from './contact-messaging-webhook.types.js';

/** Organizations one read of the messaging sweep pages through. */
const PENDING_SWEEP_BATCH = 500;

/** A stored update the processing job claimed. */
export interface ClaimedMessagingWebhookEvent {
  id: number;
  channel: MessagingWebhookChannel;
  payload: Record<string, unknown>;
  attemptCount: number;
}

/** The claim condition: pending, and unclaimed or claimed by a job that died. */
function claimable() {
  return and(
    eq(messaging_webhook_events.status, MESSAGING_WEBHOOK_EVENT_STATUS.PENDING),
    or(
      isNull(messaging_webhook_events.claimed_at),
      lt(
        messaging_webhook_events.claimed_at,
        sql`now() - make_interval(mins => ${MESSAGING_WEBHOOK_EVENT_CLAIM_STALE_MINUTES})`,
      ),
    ),
  );
}

/** The update's SHA-256 — Meta's retry of the same update is the same row. */
export function hashMessagingWebhookUpdate(update: MessagingWebhookUpdate): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        channel: update.channel,
        account: update.accountId,
        payload: update.payload,
      }),
    )
    .digest('hex');
}

/**
 * The messaging webhook's ingress persistence (launch D77) — which organization a callback's
 * account belongs to, and its updates stored for it.
 *
 * @remarks
 * - **Algorithm:** the organization comes from the SECURITY DEFINER resolver
 *   `tenancy.resolve_organization_public_id_for_messaging_account` (the webhook runs before any
 *   organization is known); the insert runs in that organization's context and skips an update
 *   it already holds (`payload_hash`).
 * - **Failure modes:** database errors propagate — the webhook answers 5xx and Meta retries.
 */
export class ContactMessagingWebhookRepository {
  /** The public id of the organization whose settings hold this account, or `null`. */
  async resolveOrganizationPublicId(options: {
    channel: MessagingWebhookChannel;
    accountId: string;
  }): Promise<string | null> {
    const result = await getContextFreeDatabase().execute(
      sql`SELECT tenancy.resolve_organization_public_id_for_messaging_account(${options.channel}, ${options.accountId}) AS public_id`,
    );
    const rows = (
      Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
    ) as { public_id: string | null }[];
    return rows[0]?.public_id ?? null;
  }

  /** Stores an organization's updates (in its context); answers how many were new. */
  async insertUpdates(options: {
    organizationPublicId: string;
    updates: readonly MessagingWebhookUpdate[];
  }): Promise<number> {
    if (options.updates.length === 0) return 0;
    const database = getRequestDatabase();
    const organization = await database
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.public_id, options.organizationPublicId))
      .limit(1);
    const organizationId = organization[0]?.id;
    if (organizationId === undefined) return 0;
    const inserted = await database
      .insert(messaging_webhook_events)
      .values(
        options.updates.map((update) => ({
          organization_id: organizationId,
          channel: update.channel,
          payload: { account_id: update.accountId, ...update.payload },
          payload_hash: hashMessagingWebhookUpdate(update),
        })),
      )
      .onConflictDoNothing({
        target: [messaging_webhook_events.organization_id, messaging_webhook_events.payload_hash],
      })
      .returning({ id: messaging_webhook_events.id });
    return inserted.length;
  }
}

/**
 * The processing job's reads and writes on the stored updates (launch D77), on a handle pinned to
 * one organization's context.
 *
 * @remarks
 * - **Algorithm:** claims the oldest pending updates (`FOR UPDATE SKIP LOCKED`, `claimed_at`);
 *   each is then marked `processed`, or its failure counted — `failed` (kept, with the reason)
 *   after five tries, else back to pending for the next job.
 * - **Failure modes:** database errors propagate to the worker.
 */
export class ContactMessagingWebhookWorkerRepository {
  constructor(private readonly databaseHandle: WorkerDatabaseHandle) {}

  /** Claims up to `limit` pending updates of the organization, oldest first. */
  async claimBatch(options: {
    organizationId: number;
    limit: number;
  }): Promise<ClaimedMessagingWebhookEvent[]> {
    const candidates = this.databaseHandle
      .select({ id: messaging_webhook_events.id })
      .from(messaging_webhook_events)
      .where(and(eq(messaging_webhook_events.organization_id, options.organizationId), claimable()))
      .orderBy(asc(messaging_webhook_events.received_at), asc(messaging_webhook_events.id))
      .limit(options.limit)
      .for('update', { skipLocked: true });
    const claimed = await this.databaseHandle
      .update(messaging_webhook_events)
      .set({
        claimed_at: sql`now()`,
        updated_at: sql`greatest(now(), ${messaging_webhook_events.created_at})`,
      } as never)
      .where(inArray(messaging_webhook_events.id, candidates))
      .returning({
        id: messaging_webhook_events.id,
        channel: messaging_webhook_events.channel,
        payload: messaging_webhook_events.payload,
        attemptCount: messaging_webhook_events.attempt_count,
        receivedAt: messaging_webhook_events.received_at,
      });
    // RETURNING keeps no order: the oldest goes first.
    claimed.sort(
      (left, right) => left.receivedAt.getTime() - right.receivedAt.getTime() || left.id - right.id,
    );
    return claimed.map((event) => ({
      id: event.id,
      channel: event.channel as MessagingWebhookChannel,
      payload: event.payload as Record<string, unknown>,
      attemptCount: event.attemptCount,
    }));
  }

  /** The update is applied. */
  async markProcessed(id: number): Promise<void> {
    await this.databaseHandle
      .update(messaging_webhook_events)
      .set({
        status: MESSAGING_WEBHOOK_EVENT_STATUS.PROCESSED,
        processed_at: sql`now()`,
        claimed_at: null,
        updated_at: sql`greatest(now(), ${messaging_webhook_events.created_at})`,
      } as never)
      .where(eq(messaging_webhook_events.id, id));
  }

  /** The update failed once more — `failed` after the last try, else pending again. */
  async recordFailure(options: { id: number; reason: string }): Promise<void> {
    const isLastTry = sql`${messaging_webhook_events.attempt_count} + 1 >= ${MESSAGING_WEBHOOK_EVENT_MAX_ATTEMPTS}`;
    await this.databaseHandle
      .update(messaging_webhook_events)
      .set({
        attempt_count: sql`${messaging_webhook_events.attempt_count} + 1`,
        status: sql`case when ${isLastTry} then ${MESSAGING_WEBHOOK_EVENT_STATUS.FAILED} else ${MESSAGING_WEBHOOK_EVENT_STATUS.PENDING} end`,
        failure_reason: options.reason.slice(0, 280),
        claimed_at: null,
        updated_at: sql`greatest(now(), ${messaging_webhook_events.created_at})`,
      } as never)
      .where(eq(messaging_webhook_events.id, options.id));
  }

  /** Gives claimed updates back (Meta down while looking up an Instagram sender). */
  async releaseClaims(ids: readonly number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.databaseHandle
      .update(messaging_webhook_events)
      .set({ claimed_at: null } as never)
      .where(
        and(
          inArray(messaging_webhook_events.id, [...ids]),
          eq(messaging_webhook_events.status, MESSAGING_WEBHOOK_EVENT_STATUS.PENDING),
        ),
      );
  }
}

/** Worker-only factory — a handle pinned to one organization's context (D77). */
export function createWorkerContactMessagingWebhookRepository(
  databaseHandle: WorkerDatabaseHandle,
): ContactMessagingWebhookWorkerRepository {
  assertWorkerDatabaseContext(['organization']);
  return new ContactMessagingWebhookWorkerRepository(databaseHandle);
}

/**
 * The organizations with a pending update no live job holds — the messaging sweep's reclaim read
 * (launch D77), across organizations, in id order after `afterId`.
 *
 * @remarks
 * - **Failure modes:** a database error propagates to the sweep (BullMQ retries it).
 */
export async function findOrganizationsWithPendingMessagingEvents(
  databaseHandle: WorkerDatabaseHandle,
  afterId: number,
): Promise<{ id: number; publicId: string }[]> {
  assertWorkerDatabaseContext(['global_retention_cleanup']);
  return databaseHandle
    .selectDistinct({ id: organizations.id, publicId: organizations.public_id })
    .from(messaging_webhook_events)
    .innerJoin(organizations, eq(organizations.id, messaging_webhook_events.organization_id))
    .where(
      and(
        claimable(),
        sql`${messaging_webhook_events.organization_id} > ${afterId}`,
        isNull(organizations.deleted_at),
      ),
    )
    .orderBy(asc(organizations.id))
    .limit(PENDING_SWEEP_BATCH);
}

/**
 * Removes stored updates older than the retention window that are done with — processed or
 * failed (launch D77); pending ones stay until applied.
 *
 * @remarks
 * - **Algorithm:** batched deletes over the `received_at` index, a capped number per run.
 * - **Failure modes:** a database error propagates (BullMQ retries the daily job).
 */
export async function purgeOldMessagingWebhookEvents(
  databaseHandle: WorkerDatabaseHandle,
): Promise<{ deletedCount: number; hasMore: boolean }> {
  assertWorkerDatabaseContext(['global_retention_cleanup']);
  const result = await deleteInBatchesByCondition({
    databaseHandle,
    table: messaging_webhook_events,
    idColumn: messaging_webhook_events.id,
    whereCondition: and(
      lt(
        messaging_webhook_events.received_at,
        sql`now() - make_interval(days => ${MESSAGING_WEBHOOK_EVENT_RETENTION_DAYS})`,
      ),
      inArray(messaging_webhook_events.status, [
        MESSAGING_WEBHOOK_EVENT_STATUS.PROCESSED,
        MESSAGING_WEBHOOK_EVENT_STATUS.FAILED,
      ]),
    )!,
    logContext: 'messaging-webhook-event-retention',
    tableLabel: 'app.messaging_webhook_events',
  });
  return { deletedCount: result.deletedCount, hasMore: result.hasMore };
}
