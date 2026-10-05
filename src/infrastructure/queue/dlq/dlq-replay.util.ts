import type { Queue } from 'bullmq';
import {
  MAINTENANCE_SCOPE,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { eq } from 'drizzle-orm';
import { logs } from '@/domains/audit/audit.schema.js';
import { users } from '@/domains/user/user.schema.js';
import {
  DLQ_QUEUE_SUFFIX,
  type DeadLetterJobData,
  getDeadLetterQueueClient,
  listDeadLetterQueueNames,
} from '@/infrastructure/queue/dlq/dead-letter.js';
import {
  getWebhookDeliveryQueue,
  WEBHOOK_DELIVERY_QUEUE_NAME,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js';
import {
  getNotificationQueue,
  NOTIFICATION_QUEUE_NAME,
} from '@/domains/notify/sub-domains/notification/queues/notification.queue.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/**
 * Source queues whose DLQ payloads {@link buildReplayJobPayload} knows how to reconstruct.
 * Retention/observability DLQs are intentionally excluded — their jobs carry no business
 * payload worth replaying, so operators must clear them manually. So are mail and Stripe webhook
 * jobs, whose rows carry their own retry: a mail job that failed for good left its row `failed`
 * with the body scrubbed (it can never be re-sent — the user asks for a new email), or — circuit
 * open on the last attempt — `pending`, which the outbox sweeper re-enqueues on its own; a Stripe
 * event's ledger row is reclaimed by the `stripe-webhook-event-reclaim` sweep until it is
 * processed or abandoned (`tool:stripe-webhook-replay -- --retry` restarts an abandoned one).
 * Replaying them from the DLQ too would be a second retry path. Their DLQ entries are a record.
 */
export const DLQ_REPLAY_SOURCE_QUEUE_NAMES = [
  WEBHOOK_DELIVERY_QUEUE_NAME,
  NOTIFICATION_QUEUE_NAME,
] as const;

/**
 * Each replayable source queue's own producer. A replay goes through it so the queue's default
 * job options — attempts, backoff, retention — apply to the replayed job: added through a bare
 * `Queue`, a replay got one attempt and was kept in Redis forever.
 */
const REPLAY_SOURCE_QUEUE_PRODUCERS: Readonly<
  Record<(typeof DLQ_REPLAY_SOURCE_QUEUE_NAMES)[number], () => Queue>
> = {
  [WEBHOOK_DELIVERY_QUEUE_NAME]: getWebhookDeliveryQueue,
  [NOTIFICATION_QUEUE_NAME]: getNotificationQueue,
};

function getReplaySourceQueue(sourceQueueName: string): Queue | null {
  const getProducer =
    REPLAY_SOURCE_QUEUE_PRODUCERS[sourceQueueName as keyof typeof REPLAY_SOURCE_QUEUE_PRODUCERS];
  return getProducer ? getProducer() : null;
}

/** DLQ queue names accepted by the `tool:dlq-replay` CLI (derived from {@link DLQ_REPLAY_SOURCE_QUEUE_NAMES}). */
export const KNOWN_DEAD_LETTER_QUEUE_NAMES = listDeadLetterQueueNames(
  DLQ_REPLAY_SOURCE_QUEUE_NAMES,
);

/**
 * Normalises an operator-supplied queue filter (with or without the `-dlq` suffix) into a
 * concrete list of DLQ names to inspect. Throws when the filter does not match a known
 * replayable queue. With no filter, returns every replayable DLQ.
 */
export function resolveDeadLetterQueueNames(filter?: string): string[] {
  if (!filter) return [...KNOWN_DEAD_LETTER_QUEUE_NAMES];
  const normalized = filter.endsWith(DLQ_QUEUE_SUFFIX) ? filter : `${filter}${DLQ_QUEUE_SUFFIX}`;
  if (!KNOWN_DEAD_LETTER_QUEUE_NAMES.includes(normalized)) {
    throw new Error(
      `Unknown DLQ queue: ${filter}. Known: ${KNOWN_DEAD_LETTER_QUEUE_NAMES.join(', ')}`,
    );
  }
  return [normalized];
}

/** Minimal ledger fields needed to reconstruct a replay payload from Postgres. */
export type DeadLetterLedgerReplayInput = {
  source_queue: string;
  job_id: string | null;
  job_name: string;
  payload_summary: Record<string, unknown>;
  attempts_made: number;
  replay_depth: number;
};

/**
 * Reconstructs a replay payload from an `audit.dead_letter_jobs` row (Postgres ledger).
 *
 * @remarks
 * - **Algorithm:** adapts ledger snake_case columns into {@link DeadLetterJobData} and
 *   delegates to {@link buildReplayJobPayload}.
 * - **Failure modes:** returns `null` when required summary keys are missing (same as manual replay).
 * - **Side effects:** none.
 * - **Notes:** the replayed job's `dlqReplayAttempt` is the row's `replay_depth` + 1.
 */
export function buildReplayJobPayloadFromLedger(
  record: DeadLetterLedgerReplayInput,
): Record<string, unknown> | null {
  const data: DeadLetterJobData = omitUndefined({
    original_queue: record.source_queue,
    original_job_id: record.job_id ?? undefined,
    original_job_name: record.job_name,
    original_data_summary: record.payload_summary,
    failed_reason: 'auto-retry',
    attempts_made: 0,
    max_attempts: 0,
    failed_at: new Date().toISOString(),
    replay_depth: record.replay_depth,
  });
  return buildReplayJobPayload(data);
}

/**
 * Reconstructs the minimal job payload needed to re-enqueue a dead-lettered job onto its
 * original BullMQ queue. Webhook delivery and notification jobs pull their required identifiers
 * out of {@link DeadLetterJobData.original_data_summary}: webhook (`delivery_attempt_public_id` +
 * `organization_public_id`), notification (`notification_public_id` + nullable
 * `organization_public_id` + `user_public_id`). Every other queue — mail and Stripe webhook
 * included, see {@link DLQ_REPLAY_SOURCE_QUEUE_NAMES} — or a summary missing a required key returns `null` so
 * the caller skips the replay. The payload is tagged with {@link DlqReplayJobFields} markers:
 * `dlqReplayAttempt` is one deeper than the failure being replayed, so a replay that fails for
 * good again is recorded one level down its lineage.
 */
export function buildReplayJobPayload(data: DeadLetterJobData): Record<string, unknown> | null {
  const summary = data.original_data_summary;
  let basePayload: Record<string, unknown> | null = null;

  switch (data.original_queue) {
    case WEBHOOK_DELIVERY_QUEUE_NAME: {
      const deliveryAttemptPublicId = summary.delivery_attempt_public_id;
      const organizationPublicId = summary.organization_public_id;
      if (typeof deliveryAttemptPublicId !== 'string' || typeof organizationPublicId !== 'string') {
        return null;
      }
      basePayload = { deliveryAttemptPublicId, organizationPublicId };
      break;
    }
    case NOTIFICATION_QUEUE_NAME: {
      const notificationPublicId = summary.notification_public_id;
      const userPublicId = summary.user_public_id;
      if (typeof notificationPublicId !== 'string' || typeof userPublicId !== 'string') {
        return null;
      }
      // Notification jobs carry a nullable organization scope; preserve null (a notification
      // without an organization, scoped by its recipient) and only forward a concrete public id
      // when present.
      const organizationPublicId = summary.organization_public_id;
      basePayload = {
        notificationPublicId,
        organizationPublicId:
          typeof organizationPublicId === 'string' ? organizationPublicId : null,
        userPublicId,
      };
      break;
    }
    default:
      return null;
  }

  return {
    ...basePayload,
    replayFromDlq: true,
    dlqReplayAttempt: data.replay_depth + 1,
  };
}

/**
 * Writes a `queue.dlq.replayed` row to `audit.logs` so every DLQ replay carries an actor
 * trail (resolves the supplied user public id to an internal numeric `actor_user_id`).
 * Throws when the actor is unknown — the caller in {@link replayDeadLetterJob} treats this
 * as a fatal pre-condition.
 */
export async function recordDlqReplayAuditEntry(input: {
  actorUserPublicId: string;
  deadLetterQueueName: string;
  deadLetterJobId: string;
  data: DeadLetterJobData;
}): Promise<void> {
  // The actor lookup needs an explicit RLS context: with no GUC set, both arms of
  // users_self_or_admin_access evaluate false under the RLS-subject application role
  // and the lookup returned zero rows — every manual DLQ replay failed at this
  // pre-condition. global_admin is the cross-user read arm the users policy grants.
  const [actorRow] = await withMaintenanceDatabaseContext(
    MAINTENANCE_SCOPE.GLOBAL_ADMIN,
    (databaseHandle) =>
      databaseHandle
        .select({ id: users.id })
        .from(users)
        .where(eq(users.public_id, input.actorUserPublicId))
        .limit(1),
  );

  if (!actorRow) {
    throw new Error(`Unknown actor user public id: ${input.actorUserPublicId}`);
  }

  // sec-r5-async-queue-1: DLQ replay rows are tenantless system events. After
  // sec-r4-D1 tightened the audit-INSERT policy to tenant-only, a bare INSERT
  // here is rejected by RLS. Use the system-audit-insert context (gated on
  // `organization_id IS NULL`, so it cannot impersonate a tenant) to write
  // the row.
  await withMaintenanceDatabaseContext(
    MAINTENANCE_SCOPE.SYSTEM_AUDIT_INSERT,
    async (databaseHandle) => {
      await databaseHandle.insert(logs).values({
        actor_user_id: actorRow.id,
        action: 'queue.dlq.replayed',
        resource_type: 'bullmq_dead_letter_job',
        severity: 'INFO',
        metadata: {
          dead_letter_queue: input.deadLetterQueueName,
          dead_letter_job_id: input.deadLetterJobId,
          original_queue: input.data.original_queue,
          original_job_id: input.data.original_job_id,
          replay_depth: input.data.replay_depth,
        },
      });
    },
  );
}

/**
 * Outcome of {@link replayDeadLetterJob}: either the job was re-enqueued (or simulated in
 * dry-run mode), the DLQ entry vanished before we could read it, or the payload shape was
 * not in {@link DLQ_REPLAY_SOURCE_QUEUE_NAMES} and cannot be reconstructed.
 *
 * @remarks
 * A replay only re-enqueues the source job; whether it can actually re-deliver is decided by the
 * source processor, which re-claims its row under its own idempotency rules.
 */
export type ReplayDeadLetterJobResult =
  | { status: 'replayed'; originalQueue: string }
  | { status: 'not_found' }
  | { status: 'payload_not_reconstructable' };

/**
 * Outcome of {@link autoReplayDeadLetterFromLedger} — automated sweeper replay (no CLI actor).
 */
export type AutoReplayDeadLetterFromLedgerResult =
  | { status: 'replayed'; originalQueue: string }
  | { status: 'payload_not_reconstructable' };

/**
 * Writes a `queue.dlq.auto_retried` row to `audit.logs` for automated sweeper replays.
 *
 * @remarks
 * - **Algorithm:** system-initiated audit row with `actor_user_id` null.
 * - **Failure modes:** propagates Postgres errors to the caller.
 * - **Side effects:** one append to `audit.logs`.
 * - **Notes:** complements manual `queue.dlq.replayed` entries from the CLI.
 */
export async function recordDlqAutoRetryAuditEntry(input: {
  deadLetterJobId: number;
  sourceQueue: string;
  originalJobId: string | null;
  replayDepth: number;
}): Promise<void> {
  // sec-r5-async-queue-1: tenantless system event — see the matching comment
  // in `recordDlqReplayAuditEntry` above. The system-audit-insert context fires
  // the policy arm gated on `organization_id IS NULL`.
  await withMaintenanceDatabaseContext(
    MAINTENANCE_SCOPE.SYSTEM_AUDIT_INSERT,
    async (databaseHandle) => {
      await databaseHandle.insert(logs).values({
        actor_user_id: null,
        action: 'queue.dlq.auto_retried',
        resource_type: 'bullmq_dead_letter_job',
        severity: 'INFO',
        metadata: {
          dead_letter_job_id: input.deadLetterJobId,
          original_queue: input.sourceQueue,
          original_job_id: input.originalJobId,
          replay_depth: input.replayDepth,
        },
      });
    },
  );
}

/**
 * Re-enqueues a replay payload onto its source queue through that queue's own producer, with a
 * fresh BullMQ id.
 *
 * @remarks
 * The original `jobId` is never re-used: BullMQ treats a re-`add` with an id still in Redis (the
 * original failed job, kept under `removeOnFail`) as a `duplicated` event and returns the existing
 * id without enqueueing — a silent no-op. The source worker re-runs the job under its app-layer
 * idempotency (Stripe `tryClaimEvent` ledger, webhook delivery `tryMarkSending`, notification
 * dispatch markers), so a fresh id cannot produce duplicate work.
 */
async function enqueueReplay(options: {
  sourceQueueName: string;
  jobName: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const sourceQueue = getReplaySourceQueue(options.sourceQueueName);
  if (!sourceQueue) {
    throw new Error(`dlq.replay.unknown_source_queue:${options.sourceQueueName}`);
  }
  await sourceQueue.add(options.jobName, options.payload);
}

/**
 * Re-enqueues one dead-letter ledger row onto its source queue and removes the Redis DLQ mirror.
 *
 * @remarks
 * - **Algorithm:** builds the payload from the Postgres summary (`dlqReplayAttempt` = the row's
 *   `replay_depth` + 1), adds it through the source queue's own producer (its attempts, backoff
 *   and retention apply) with a fresh BullMQ id, best-effort removes the matching Redis DLQ
 *   snapshot, and appends an audit row.
 * - **Failure modes:** `payload_not_reconstructable` when the queue is not replayable or summary
 *   keys are missing; Redis/Postgres errors propagate after a successful source enqueue.
 * - **Side effects:** BullMQ add + optional DLQ remove + audit insert.
 * - **Notes:** does not touch the ledger row — the sweeper marks it handled.
 */
export async function autoReplayDeadLetterFromLedger(input: {
  ledgerRow: DeadLetterLedgerReplayInput & { id: number; dead_letter_queue: string };
}): Promise<AutoReplayDeadLetterFromLedgerResult> {
  const payload = buildReplayJobPayloadFromLedger(input.ledgerRow);
  if (!payload) {
    return { status: 'payload_not_reconstructable' };
  }

  await enqueueReplay({
    sourceQueueName: input.ledgerRow.source_queue,
    jobName: input.ledgerRow.job_name,
    payload,
  });

  // Identifier format mirrors `enqueueDeadLetter` (`dlq-<source>-<originalId>-attempt-<n>`) so we
  // look up the snapshot for the specific terminal failure recorded in the ledger.
  const safeOriginalJobIdentifier = input.ledgerRow.job_id ?? 'unknown';
  const deadLetterJobIdentifier = `dlq-${input.ledgerRow.source_queue}-${String(safeOriginalJobIdentifier)}-attempt-${String(input.ledgerRow.attempts_made)}`;
  const deadLetterJob = await getDeadLetterQueueClient(input.ledgerRow.dead_letter_queue).getJob(
    deadLetterJobIdentifier,
  );
  if (deadLetterJob) {
    await deadLetterJob.remove();
  }

  await recordDlqAutoRetryAuditEntry({
    deadLetterJobId: input.ledgerRow.id,
    sourceQueue: input.ledgerRow.source_queue,
    originalJobId: input.ledgerRow.job_id,
    replayDepth: input.ledgerRow.replay_depth + 1,
  });

  return { status: 'replayed', originalQueue: input.ledgerRow.source_queue };
}

/**
 * Replays a single dead-lettered job: looks it up, reconstructs its payload, adds it back to the
 * source queue through that queue's own producer with a fresh BullMQ id, removes the DLQ entry,
 * and writes an audit row. In `dryRun` mode no Redis or Postgres writes happen and
 * `actorUserPublicId` is not required.
 *
 * @remarks
 * `jobId` is intentionally NOT re-used from `data.original_job_id` — see {@link enqueueReplay}.
 * The DLQ is read through the pooled, prefixed client: a bare `Queue` without the environment's
 * key prefix reads an empty namespace and finds nothing.
 */
export async function replayDeadLetterJob(input: {
  deadLetterQueueName: string;
  deadLetterJobId: string;
  dryRun: boolean;
  actorUserPublicId?: string;
}): Promise<ReplayDeadLetterJobResult> {
  const job = await getDeadLetterQueueClient(input.deadLetterQueueName).getJob(
    input.deadLetterJobId,
  );
  if (!job) {
    return { status: 'not_found' };
  }

  const data = job.data as DeadLetterJobData;
  const payload = buildReplayJobPayload(data);
  if (!payload) {
    return { status: 'payload_not_reconstructable' };
  }

  if (input.dryRun) {
    logger.info({ originalQueue: data.original_queue, payload }, 'dlq.replay.dry_run');
    return { status: 'replayed', originalQueue: data.original_queue };
  }

  if (!input.actorUserPublicId) {
    throw new Error('--actor-user-public-id is required for DLQ replay (audit log)');
  }

  await enqueueReplay({
    sourceQueueName: data.original_queue,
    jobName: data.original_job_name,
    payload,
  });
  await job.remove();
  await recordDlqReplayAuditEntry({
    actorUserPublicId: input.actorUserPublicId,
    deadLetterQueueName: input.deadLetterQueueName,
    deadLetterJobId: input.deadLetterJobId,
    data,
  });
  return { status: 'replayed', originalQueue: data.original_queue };
}

/**
 * The jobs waiting in one DLQ, oldest first, at most `limit` — read through the pooled, prefixed
 * client (the `tool:dlq-replay --replay-all` CLI walks this list).
 */
export async function listDeadLetterJobIds(options: {
  deadLetterQueueName: string;
  limit: number;
}): Promise<string[]> {
  const jobs = await getDeadLetterQueueClient(options.deadLetterQueueName).getJobs(
    ['waiting', 'failed'],
    0,
    options.limit - 1,
  );
  return jobs.flatMap((job) => (job.id ? [job.id] : []));
}

/**
 * Prints the first 100 waiting/failed jobs from a DLQ to stdout in a tab-separated layout
 * (`jobId\toriginal_queue\toriginal_job_name\treplay_depth=N\tfailed_reason`). Used only
 * by the `tool:dlq-replay` CLI; never call from API or worker code.
 */
export async function listDeadLetterJobs(deadLetterQueueName: string): Promise<void> {
  const jobs = await getDeadLetterQueueClient(deadLetterQueueName).getJobs(
    ['waiting', 'failed'],
    0,
    99,
  );
  if (jobs.length === 0) {
    // biome-ignore lint/suspicious/noConsole: tabular CLI output for tool:dlq-replay (terminal user, not log aggregator).
    console.log(`${deadLetterQueueName}: (empty)`);
    return;
  }
  for (const job of jobs) {
    const data = job.data as DeadLetterJobData;
    // biome-ignore lint/suspicious/noConsole: tabular CLI output for tool:dlq-replay (terminal user, not log aggregator).
    console.log(
      [
        job.id,
        data.original_queue,
        data.original_job_name,
        `replay_depth=${String(data.replay_depth ?? 0)}`,
        data.failed_reason?.slice(0, 60) ?? '',
      ].join('\t'),
    );
  }
  // biome-ignore lint/suspicious/noConsole: tabular CLI output for tool:dlq-replay (terminal user, not log aggregator).
  console.log(`${deadLetterQueueName}: ${jobs.length} job(s)`);
}
