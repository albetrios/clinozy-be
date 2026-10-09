import { and, asc, eq, lt, sql } from 'drizzle-orm';
import {
  type RequestScopedPostgresDatabase,
  assertWorkerDatabaseContext,
  getRequestDatabase,
  resolveRepositoryDatabaseHandle,
} from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import type { WorkerDatabaseHandle } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import {
  webhook_delivery_attempts,
  webhooks,
} from '@/domains/notify/sub-domains/webhook/webhook.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';

/**
 * Worker-side projection joining `webhook_delivery_attempts` with its parent webhook — carries
 * everything {@link processWebhookDeliveryAttempt} needs to build the signed HTTP request
 * (URL, encrypted signing secret, event metadata, payload, attempt counter).
 *
 * @remarks
 * sec-N1: `webhookIsEnabled` and `webhookDeletedAt` are projected through so the
 * worker can re-check the parent webhook's live state at claim time. The fan-out
 * query already filters on enabled, but BullMQ retries skip that path — without
 * this re-check, an attacker-controlled URL keeps receiving signed POSTs for
 * ~3 minutes after operators disable / soft-delete the webhook.
 */
export interface WebhookDeliveryAttemptWithWebhook {
  deliveryAttemptId: number;
  // sec-new-B2: opaque public identifier projected from the row so workers can
  // use it as the X-Webhook-Delivery-Id header value without exposing the bigserial.
  deliveryAttemptPublicId: string;
  webhookId: number;
  // Keys the per-webhook outbound circuit breaker — the bigserial would hand a webhook created
  // after an id restart the open breaker of the one that held its id before.
  webhookPublicId: string;
  webhookUrl: string;
  encryptedSecret: string;
  eventType: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  webhookIsEnabled: boolean;
  webhookDeletedAt: Date | null;
  // sec-N8: dual-sign window. When the previous secret is set AND
  // `now() < secretRotatedAt + WEBHOOK_SECRET_ROTATION_OVERLAP_HOURS`,
  // the worker also emits `X-Webhook-Signature-Previous` so the customer
  // can accept either signature while rolling their verifier.
  encryptedSecretPrevious: string | null;
  secretRotatedAt: Date | null;
}

function resolveDatabase(
  databaseHandle?: RequestScopedPostgresDatabase,
): RequestScopedPostgresDatabase {
  return resolveRepositoryDatabaseHandle(databaseHandle);
}

/**
 * Resolve a webhook's owning organization public id by joining `notify.webhooks` to
 * `tenancy.organizations`. Used when an event handler has only the internal `webhook_id`.
 */
export async function findOrganizationPublicIdByWebhookId(
  webhook_id: number,
  databaseHandle?: RequestScopedPostgresDatabase,
): Promise<string | null> {
  const rows = await resolveDatabase(databaseHandle)
    .select({ organizationPublicId: organizations.public_id })
    .from(webhooks)
    .innerJoin(organizations, eq(webhooks.organization_id, organizations.id))
    .where(eq(webhooks.id, webhook_id))
    .limit(1);
  return rows[0]?.organizationPublicId ?? null;
}

/**
 * Resolve the organization public id for a given delivery attempt by joining attempts →
 * webhooks → organizations. Used by the event handler to scope the BullMQ enqueue to the
 * correct tenant before the worker reads under RLS.
 */
export async function findOrganizationPublicIdByDeliveryAttemptPublicId(
  delivery_attempt_public_id: string,
  databaseHandle?: RequestScopedPostgresDatabase,
): Promise<string | null> {
  const rows = await resolveDatabase(databaseHandle)
    .select({ organizationPublicId: organizations.public_id })
    .from(webhook_delivery_attempts)
    .innerJoin(webhooks, eq(webhook_delivery_attempts.webhook_id, webhooks.id))
    .innerJoin(organizations, eq(webhooks.organization_id, organizations.id))
    .where(eq(webhook_delivery_attempts.public_id, delivery_attempt_public_id))
    .limit(1);
  return rows[0]?.organizationPublicId ?? null;
}

/**
 * Delivery attempts still `PENDING` that were created before `createdBefore`, oldest first, each
 * with its organization's public id — the reclaim sweep's candidates.
 *
 * @remarks
 * - **Algorithm:** `PENDING` attempts joined to their webhook and organization, ordered by
 *   `created_at`, capped at `limit`. A worker claims an attempt (`PENDING → SENDING`) as soon as
 *   its job starts, so an older `PENDING` row lost its job or waits behind a backlog.
 * - **Failure modes:** throws `WorkerDatabaseContextError` outside the global-retention context —
 *   under an organization scope RLS would silently return one tenant's rows.
 * - **Side effects:** none — a read.
 * - **Notes:** crosses organizations: the attempts', webhooks' and organizations' RLS policies admit
 *   the maintenance role under `app.global_retention_cleanup`. Attempts of a disabled or deleted
 *   webhook are included — the delivery worker settles them (`webhook_disabled`).
 */
export async function findStalePendingDeliveryAttempts(
  databaseHandle: WorkerDatabaseHandle,
  options: { createdBefore: Date; limit: number },
): Promise<Array<{ deliveryAttemptPublicId: string; organizationPublicId: string }>> {
  assertWorkerDatabaseContext(['global_retention_cleanup']);
  return databaseHandle
    .select({
      deliveryAttemptPublicId: webhook_delivery_attempts.public_id,
      organizationPublicId: organizations.public_id,
    })
    .from(webhook_delivery_attempts)
    .innerJoin(webhooks, eq(webhook_delivery_attempts.webhook_id, webhooks.id))
    .innerJoin(organizations, eq(webhooks.organization_id, organizations.id))
    .where(
      and(
        eq(webhook_delivery_attempts.status, 'PENDING'),
        lt(webhook_delivery_attempts.created_at, options.createdBefore),
      ),
    )
    .orderBy(asc(webhook_delivery_attempts.created_at))
    .limit(options.limit);
}

/**
 * Turns a webhook off after its endpoint answered `410 Gone` — the receiver's way of saying it
 * will never accept another delivery. Worker-side, under the webhook's organization scope.
 */
export async function disableWebhookAfterEndpointGone(
  webhook_id: number,
  databaseHandle?: RequestScopedPostgresDatabase,
): Promise<void> {
  await resolveDatabase(databaseHandle)
    .update(webhooks)
    .set({ is_enabled: false, updated_at: new Date() })
    .where(eq(webhooks.id, webhook_id));
}

/**
 * Worker-side fetch that returns the full {@link WebhookDeliveryAttemptWithWebhook} projection
 * for a given attempt within an organization scope, or `null` if the attempt does not belong
 * to that organization.
 */
export async function findWebhookDeliveryAttemptWithWebhook(
  delivery_attempt_public_id: string,
  organization_public_id: string,
  databaseHandle?: RequestScopedPostgresDatabase,
): Promise<WebhookDeliveryAttemptWithWebhook | null> {
  const rows = await resolveDatabase(databaseHandle)
    .select({
      deliveryAttemptId: webhook_delivery_attempts.id,
      deliveryAttemptPublicId: webhook_delivery_attempts.public_id,
      webhookId: webhooks.id,
      webhookPublicId: webhooks.public_id,
      webhookUrl: webhooks.url,
      encryptedSecret: webhooks.encrypted_secret,
      eventType: webhook_delivery_attempts.event_type,
      payload: webhook_delivery_attempts.payload,
      attemptCount: webhook_delivery_attempts.attempt_count,
      webhookIsEnabled: webhooks.is_enabled,
      webhookDeletedAt: webhooks.deleted_at,
      encryptedSecretPrevious: webhooks.encrypted_secret_previous,
      secretRotatedAt: webhooks.secret_rotated_at,
    })
    .from(webhook_delivery_attempts)
    .innerJoin(webhooks, eq(webhook_delivery_attempts.webhook_id, webhooks.id))
    .innerJoin(organizations, eq(webhooks.organization_id, organizations.id))
    .where(
      and(
        eq(webhook_delivery_attempts.public_id, delivery_attempt_public_id),
        eq(organizations.public_id, organization_public_id),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    deliveryAttemptId: row.deliveryAttemptId,
    deliveryAttemptPublicId: row.deliveryAttemptPublicId,
    webhookId: row.webhookId,
    webhookPublicId: row.webhookPublicId,
    webhookUrl: row.webhookUrl,
    encryptedSecret: row.encryptedSecret,
    eventType: row.eventType,
    payload: row.payload as Record<string, unknown>,
    attemptCount: row.attemptCount,
    webhookIsEnabled: row.webhookIsEnabled,
    webhookDeletedAt: row.webhookDeletedAt,
    encryptedSecretPrevious: row.encryptedSecretPrevious,
    secretRotatedAt: row.secretRotatedAt,
  };
}

/**
 * Insert the canonical `PENDING` delivery-attempt row that {@link emitWebhookDeliveryRequested}
 * publishes through the event bus. Returns its public id — the BullMQ job id and job payload,
 * unique across databases (see `enqueueWebhookDelivery`).
 *
 * @remarks
 * sec-N2: when `eventKey` is supplied, persist it and apply
 * `onConflictDoNothing({ target: [webhook_id, event_key] })`. The partial unique
 * index `idx_webhook_delivery_attempts_pending_event_key` filters on
 * `status='PENDING' AND event_key IS NOT NULL`, so a re-run of the same logical
 * event (BullMQ retry, transient DB blip) is a no-op against the existing PENDING
 * row instead of fanning out a duplicate signed POST. Returns `null` when that row left
 * `PENDING` between the conflict and the lookup — a worker already claimed it, so the event is
 * being delivered and there is nothing to enqueue. Events without a stable upstream id
 * (`eventKey` omitted) always insert a new row.
 */
export async function createPendingWebhookDeliveryAttempt(input: {
  webhookId: number;
  eventType: string;
  payload: Record<string, unknown>;
  eventKey?: string;
}): Promise<{ publicId: string } | null> {
  const baseValues = {
    webhook_id: input.webhookId,
    event_type: input.eventType,
    payload: input.payload,
    status: 'PENDING',
    attempt_count: 0,
    // sec-new-B2: generate once at insert so every retry of the same job reads the
    // same public_id from the DB and emits a stable X-Webhook-Delivery-Id header.
    public_id: generatePublicId('webhookDeliveryAttempt'),
  };
  const insertBuilder = getRequestDatabase().insert(webhook_delivery_attempts);
  if (input.eventKey !== undefined) {
    const rows = await insertBuilder
      .values({ ...baseValues, event_key: input.eventKey })
      .onConflictDoNothing({
        target: [webhook_delivery_attempts.webhook_id, webhook_delivery_attempts.event_key],
        // PostgreSQL must infer the existing partial index, including its literal predicate.
        where: sql`${webhook_delivery_attempts.status} = 'PENDING' AND ${webhook_delivery_attempts.event_key} IS NOT NULL`,
      })
      .returning({ publicId: webhook_delivery_attempts.public_id });
    if (rows[0]) return rows[0];
    // Conflict path: another inserter already wrote the PENDING row for this
    // (webhook_id, event_key). Look up its id so the caller can enqueue against
    // the existing row instead of dropping the delivery.
    // sec-new-D4: filter on status='PENDING' — the partial unique index only
    // covers PENDING rows, so the conflict guarantee ends once the row
    // transitions to SENDING/SENT/FAILED. Matching only PENDING here avoids
    // handing a completed-row id back to the caller.
    const existing = await getRequestDatabase()
      .select({ publicId: webhook_delivery_attempts.public_id })
      .from(webhook_delivery_attempts)
      .where(
        and(
          eq(webhook_delivery_attempts.webhook_id, input.webhookId),
          eq(webhook_delivery_attempts.event_key, input.eventKey),
          eq(webhook_delivery_attempts.status, 'PENDING'),
        ),
      )
      .limit(1);
    return existing[0] ?? null;
  }
  const rows = await insertBuilder
    .values(baseValues)
    .returning({ publicId: webhook_delivery_attempts.public_id });
  return rows[0]!;
}

/** Worker-only — requires an explicit handle from `withAppDatabaseContext`. */
export function createWorkerWebhookDeliveryQueries(databaseHandle: WorkerDatabaseHandle) {
  assertWorkerDatabaseContext(['organization']);
  return {
    findWebhookDeliveryAttemptWithWebhook: (
      deliveryAttemptPublicId: string,
      organizationPublicId: string,
    ) =>
      findWebhookDeliveryAttemptWithWebhook(
        deliveryAttemptPublicId,
        organizationPublicId,
        databaseHandle,
      ),
    disableWebhookAfterEndpointGone: (webhookId: number) =>
      disableWebhookAfterEndpointGone(webhookId, databaseHandle),
  };
}
