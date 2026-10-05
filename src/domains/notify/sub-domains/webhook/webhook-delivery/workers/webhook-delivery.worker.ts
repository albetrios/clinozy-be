import { createHmac } from 'node:crypto';
import { UnrecoverableError, Worker } from 'bullmq';
import { captureMessage } from '@/infrastructure/observability/sentry/sentry.js';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import { buildOutboundCallOptions, outboundCall } from '@/infrastructure/outbound/index.js';
import { createPinnedWebhookFetch } from '@/shared/utils/security/webhook-outbound-fetch.util.js';
import { getWebhookWorkerOptions } from '@/infrastructure/queue/worker-runtime/worker-options.js';
import {
  fetchWebhookWithCircuitBreaker,
  webhookDeliveryBackoffWithJitter,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-outbound-circuit.js';
import { getWorkerConcurrencyWebhook } from '@/shared/config/worker-concurrency.util.js';
import { safeWebhookUrlForLogs } from '@/shared/utils/security/safe-webhook-url-for-logs.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import { webhookDeliveryJobDataSchema } from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.job.schema.js';
import {
  WEBHOOK_DELIVERY_JOB_ATTEMPTS,
  WEBHOOK_DELIVERY_QUEUE_NAME,
  type WebhookDeliveryJobData,
  webhookDeliveryRetryBaseDelayMs,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js';
import { parseJobDataOrDeadLetter } from '@/infrastructure/queue/dlq/poison-job.util.js';
import { runWithPropagatedTraceContext } from '@/infrastructure/observability/tracing/trace-context.util.js';
import {
  createWorkerWebhookDeliveryQueries,
  type WebhookDeliveryAttemptWithWebhook,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/webhook-delivery.repository.js';
import {
  createWorkerWebhookDeliveryAttemptRepository,
  type WebhookDeliveryAttemptRepository,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/webhook-delivery-attempt.repository.js';
import { decryptFieldSecret } from '@/shared/utils/security/field-secret-encryption.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import type { WorkerHandle } from '@/infrastructure/queue/bootstrap.js';
import { buildWorkerHandle } from '@/infrastructure/queue/worker-runtime/worker-close.util.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { MILLISECONDS_PER_HOUR } from '@/shared/constants/ttl.constants.js';
import { env } from '@/shared/config/env.config.js';

/** Maximum response-body length persisted to the delivery-attempt record (bounds storage growth). */
const WEBHOOK_DELIVERY_RESPONSE_BODY_STORED_MAX_LENGTH = 2_000;

/**
 * audit-#6: hard cap on the number of (decompressed) response bytes the worker will read off the
 * wire before cancelling the stream. The stored body is only {@link WEBHOOK_DELIVERY_RESPONSE_BODY_STORED_MAX_LENGTH}
 * characters, so 16 KiB is comfortably more than we keep while preventing a hostile or broken
 * endpoint from returning a multi-gigabyte / gzip-bomb body that exhausts worker heap (a poison
 * job that OOM-loops across retries and starves every tenant sharing the worker).
 */
const WEBHOOK_DELIVERY_RESPONSE_BODY_READ_MAX_BYTES = 16_384;

/** Suffix appended to a stored response body that was truncated (read cap or stored-length cap). */
const WEBHOOK_DELIVERY_RESPONSE_BODY_TRUNCATION_MARKER = '…[truncated]';

/**
 * Reads at most `maxBytes` of a fetch response body by streaming the reader and cancelling once the
 * cap is hit, so the worker never materialises an unbounded (or gzip-expanded) body in memory.
 *
 * @remarks
 * - **Algorithm:** pulls chunks from `response.body.getReader()` (which yields **decompressed**
 *   bytes, so the cap also bounds a gzip bomb), accumulating until `maxBytes`; the chunk that would
 *   cross the cap is sliced to the remaining budget and the reader is cancelled.
 * - **Failure modes:** when there is no readable stream (e.g. a mocked/empty body) it falls back to
 *   the bounded `response.text()`; the reader is always cancelled in a `finally` to release the
 *   socket.
 * - **Side effects:** consumes (and cancels) the response stream.
 */
async function readResponseBodyCapped(
  response: Response,
  maxBytes: number,
): Promise<{ body: string; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return { body: text.slice(0, maxBytes), truncated: text.length > maxBytes };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      const remaining = maxBytes - total;
      if (value.byteLength > remaining) {
        if (remaining > 0) chunks.push(value.subarray(0, remaining));
        truncated = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return {
    body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8'),
    truncated,
  };
}

/**
 * Clamps a decoded response body to the stored-length cap, appending a truncation marker when the
 * body was cut at either the byte read-cap or the stored-length cap (audit-#6).
 */
function formatStoredResponseBody(decoded: string, networkTruncated: boolean): string {
  const overStoredLimit = decoded.length > WEBHOOK_DELIVERY_RESPONSE_BODY_STORED_MAX_LENGTH;
  if (!(networkTruncated || overStoredLimit)) {
    return decoded;
  }
  return (
    decoded.slice(
      0,
      WEBHOOK_DELIVERY_RESPONSE_BODY_STORED_MAX_LENGTH -
        WEBHOOK_DELIVERY_RESPONSE_BODY_TRUNCATION_MARKER.length,
    ) + WEBHOOK_DELIVERY_RESPONSE_BODY_TRUNCATION_MARKER
  );
}

/**
 * Sign a webhook payload with HMAC-SHA256 (Stripe-style signature).
 */
function signPayload(secret: string, payload: string, timestamp: number): string {
  const signedPayload = `${timestamp}.${payload}`;
  return createHmac('sha256', secret).update(signedPayload).digest('hex');
}

/**
 * The `next_retry_at` recorded with a failed attempt: when BullMQ will try again (the schedule's
 * base delay; the backoff adds jitter on top), or `null` after the last attempt.
 */
function computeNextRetryAt(attemptsMadeBefore: number): Date | null {
  const failedAttempts = attemptsMadeBefore + 1;
  if (failedAttempts >= WEBHOOK_DELIVERY_JOB_ATTEMPTS) return null;
  return new Date(Date.now() + webhookDeliveryRetryBaseDelayMs(failedAttempts));
}

/**
 * Type of the outbound fetch implementation used by the webhook delivery worker — kept as a
 * separate alias so unit tests can swap in a mock without `as unknown as typeof fetch`.
 *
 * @remarks
 * - **Algorithm:** identical signature to the global `fetch`.
 * - **Failure modes:** errors propagate from the underlying implementation.
 * - **Side effects:** none on its own.
 * - **Notes:** the worker substitutes a DNS-pinned, allowlisted `fetch` for production calls
 *   and accepts the raw global `fetch` only as the test default.
 */
export type WebhookDeliveryFetch = typeof fetch;

const defaultWebhookDeliveryFetch = globalThis.fetch;

/** Job-level context threaded through the three delivery phases. */
interface WebhookDeliveryJobContext {
  id?: string;
  attemptsMade: number;
  requestId?: string;
}

/**
 * What one delivery job did: delivered (2xx), skipped (already sent, or the webhook is disabled or
 * deleted), or stopped because the endpoint answered `410 Gone` — after which the webhook is off.
 *
 * @remarks
 * Every variant completes the BullMQ job: a skip or a `410` is final, not a failure to retry.
 * Retryable receiver failures are thrown ({@link WebhookEndpointFailure}), never returned. The
 * value is the job's return value, so it shows on the completed job in Bull Board.
 */
export type WebhookDeliveryJobResult =
  | { outcome: 'delivered'; httpStatus: number }
  | { outcome: 'skipped'; reason: 'already_sent' | 'webhook_disabled' }
  | { outcome: 'endpoint_gone'; httpStatus: 410 };

/**
 * A delivery the receiver failed: a non-2xx answer (other than 410), a timeout, a refused
 * connection, or the webhook's own circuit open.
 *
 * @remarks
 * Retried on the delivery schedule. When the retries run out the job lands in the dead-letter
 * ledger at warn level instead of paging anyone (`expectedFinalFailure`): the failure is the
 * receiver's, and the webhook's owner sees it on the attempt row. Errors on our side — the
 * database, an unreadable signing secret — are not this class and alert as usual.
 */
export class WebhookEndpointFailure extends Error {
  /** Read by the dead-letter listener: record the final failure, but no Sentry page. */
  readonly expectedFinalFailure = true;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WebhookEndpointFailure';
  }
}

/** Result of the claim phase — a skip (already sent, webhook disabled) or a claimed attempt. */
type WebhookDeliveryClaim =
  | { status: 'skipped'; reason: 'already_sent' | 'webhook_disabled' }
  | { status: 'claimed'; deliveryContext: WebhookDeliveryAttemptWithWebhook };

/**
 * Phase 1 (short DB transaction): load the attempt + webhook under the organization RLS scope and
 * claim it (any status but `SENT` → `SENDING`). Returns the loaded context for the network
 * phase, or a skip. The transaction closes before the caller performs any network IO.
 */
async function claimWebhookDeliveryAttempt(options: {
  deliveryAttemptPublicId: string;
  organizationPublicId: string;
  deliveryAttemptRepository?: WebhookDeliveryAttemptRepository | undefined;
}): Promise<WebhookDeliveryClaim> {
  const { deliveryAttemptPublicId, organizationPublicId, deliveryAttemptRepository } = options;
  return withAppDatabaseContext(
    PRINCIPAL_SCOPE.JOB({ organizationPublicId: organizationPublicId }),
    async (databaseHandle) => {
      const attemptRepository =
        deliveryAttemptRepository ?? createWorkerWebhookDeliveryAttemptRepository(databaseHandle);
      const webhookDeliveryQueries = createWorkerWebhookDeliveryQueries(databaseHandle);
      const deliveryContext = await webhookDeliveryQueries.findWebhookDeliveryAttemptWithWebhook(
        deliveryAttemptPublicId,
        organizationPublicId,
      );
      if (!deliveryContext) {
        // A job's attempt row is created before the job and never deleted while a delivery can
        // still run — a missing row (or one in another organization) cannot be retried into
        // existing, so fail terminally and let the dead-letter record show it.
        throw new UnrecoverableError(
          `webhook.delivery.attempt_not_found:${deliveryAttemptPublicId}`,
        );
      }
      // sec-N1: the fan-out filter on is_enabled / deleted_at does NOT apply to
      // BullMQ retries — without this re-check, attempts continue firing the
      // signed payload to a URL operators have just disabled or soft-deleted.
      // Record FAILED (terminal, no retry) and skip. tryMarkSending is intentionally
      // skipped — there's no point claiming a row we're about to terminate.
      if (!deliveryContext.webhookIsEnabled || deliveryContext.webhookDeletedAt !== null) {
        await attemptRepository.recordOutcome(deliveryContext.deliveryAttemptId, {
          status: 'FAILED',
          response_body: 'webhook_disabled',
          next_retry_at: null,
        });
        return { status: 'skipped', reason: 'webhook_disabled' };
      }
      const sendingClaim = await attemptRepository.tryMarkSending(
        deliveryContext.deliveryAttemptId,
      );
      if (sendingClaim === 'already_sent') {
        return { status: 'skipped', reason: 'already_sent' };
      }
      return { status: 'claimed', deliveryContext };
    },
  );
}

/**
 * Phase 3 (short DB transaction): persist a delivery outcome under the organization RLS scope —
 * and, for a `410 Gone`, turn the webhook off in the same transaction. Opened fresh (not held
 * across the network call) so a slow endpoint never pins a pool checkout.
 */
async function recordWebhookDeliveryOutcome(options: {
  deliveryContext: WebhookDeliveryAttemptWithWebhook;
  organizationPublicId: string;
  outcome: {
    status: string;
    http_status_code?: number | null;
    response_body?: string | null;
    next_retry_at?: Date | null;
  };
  disableWebhook?: boolean;
  deliveryAttemptRepository?: WebhookDeliveryAttemptRepository | undefined;
}): Promise<void> {
  const { deliveryContext, organizationPublicId, outcome, deliveryAttemptRepository } = options;
  await withAppDatabaseContext(
    PRINCIPAL_SCOPE.JOB({ organizationPublicId: organizationPublicId }),
    async (databaseHandle) => {
      const attemptRepository =
        deliveryAttemptRepository ?? createWorkerWebhookDeliveryAttemptRepository(databaseHandle);
      await attemptRepository.recordOutcome(deliveryContext.deliveryAttemptId, outcome);
      if (options.disableWebhook) {
        await createWorkerWebhookDeliveryQueries(databaseHandle).disableWebhookAfterEndpointGone(
          deliveryContext.webhookId,
        );
      }
    },
  );
}

/**
 * Computes the optional `X-Webhook-Signature-Previous` header during the secret-rotation overlap
 * window, or `undefined` when no previous secret applies or the window has closed.
 *
 * @remarks
 * sec-N8 dual-sign: while `now() < secretRotatedAt + WEBHOOK_SECRET_ROTATION_OVERLAP_HOURS`, sign
 * with the previous secret too so a customer mid-rotation still sees a matching signature. A
 * decryption failure on the previous secret is swallowed (drop the header, never fail delivery).
 */
function computeWebhookPreviousSignatureHeader(options: {
  encryptedSecretPrevious: string | null;
  secretRotatedAt: Date | null;
  payloadString: string;
  timestamp: number;
  webhookPublicId: string;
}): string | undefined {
  const { encryptedSecretPrevious, secretRotatedAt, payloadString, timestamp, webhookPublicId } =
    options;
  if (
    encryptedSecretPrevious === null ||
    encryptedSecretPrevious.length === 0 ||
    secretRotatedAt === null
  ) {
    return undefined;
  }
  const overlapWindowMs = env.WEBHOOK_SECRET_ROTATION_OVERLAP_HOURS * MILLISECONDS_PER_HOUR;
  const rotatedAtMs =
    secretRotatedAt instanceof Date ? secretRotatedAt.getTime() : Number(secretRotatedAt);
  if (!Number.isFinite(rotatedAtMs) || Date.now() >= rotatedAtMs + overlapWindowMs) {
    return undefined;
  }
  try {
    const previousSecret = decryptFieldSecret(encryptedSecretPrevious);
    const previousSignature = signPayload(previousSecret, payloadString, timestamp);
    return `t=${timestamp},v1=${previousSignature}`;
  } catch (decryptError) {
    logger.warn(
      { webhookPublicId, error: decryptError },
      'webhook.delivery.previous_secret_decrypt_failed',
    );
    return undefined;
  }
}

/**
 * Builds the outbound webhook request headers (signature + optional dual-sign / request-id).
 *
 * @remarks
 * sec-N3 + sec-new-B2: `X-Webhook-Delivery-Id` carries the stable per-delivery public id (the same
 * BullMQ job reads the same row → same public id), so receivers can dedupe at-least-once
 * redeliveries without the bigserial leaking table cardinality or enabling enumeration.
 */
function buildWebhookRequestHeaders(options: {
  timestamp: number;
  signature: string;
  eventType: string;
  deliveryAttemptPublicId: string;
  previousSignatureHeader: string | undefined;
  requestId: string | undefined;
}): Record<string, string> {
  const {
    timestamp,
    signature,
    eventType,
    deliveryAttemptPublicId,
    previousSignatureHeader,
    requestId,
  } = options;
  return {
    'Content-Type': 'application/json',
    'X-Webhook-Signature': `t=${timestamp},v1=${signature}`,
    'X-Webhook-Event': eventType,
    'X-Webhook-Timestamp': String(timestamp),
    'X-Webhook-Delivery-Id': deliveryAttemptPublicId,
    ...(previousSignatureHeader ? { 'X-Webhook-Signature-Previous': previousSignatureHeader } : {}),
    ...(requestId ? { 'X-Request-Id': requestId } : {}),
  };
}

/**
 * Reads the delivery response body under the byte cap, returning the stored-form string and never
 * throwing — a read/parse failure is logged and yields a `'[parse error]'` placeholder so the
 * delivery outcome is still recorded.
 *
 * @remarks
 * audit-#6: streams at most {@link WEBHOOK_DELIVERY_RESPONSE_BODY_READ_MAX_BYTES} off the wire so a
 * hostile or broken endpoint cannot OOM the shared worker via a huge / gzip-expanded body.
 */
async function readWebhookResponseBodyOrPlaceholder(options: {
  response: Response;
  jobContext: WebhookDeliveryJobContext;
  deliveryContext: WebhookDeliveryAttemptWithWebhook;
  webhookUrlLogFields: ReturnType<typeof safeWebhookUrlForLogs>;
}): Promise<string> {
  const { response, jobContext, deliveryContext, webhookUrlLogFields } = options;
  try {
    const capped = await readResponseBodyCapped(
      response,
      WEBHOOK_DELIVERY_RESPONSE_BODY_READ_MAX_BYTES,
    );
    return formatStoredResponseBody(capped.body, capped.truncated);
  } catch (parseError) {
    logger.warn(
      {
        jobId: jobContext.id,
        requestId: jobContext.requestId,
        deliveryAttemptPublicId: deliveryContext.deliveryAttemptPublicId,
        webhookPublicId: deliveryContext.webhookPublicId,
        ...webhookUrlLogFields,
        parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
      },
      'webhook.response.body.parse.failed',
    );
    return '[parse error]';
  }
}

/**
 * Records a delivery that can never succeed on our side (an unreadable or empty signing secret),
 * pages on-call, and throws `UnrecoverableError` so BullMQ skips the remaining attempts and the
 * dead-letter listener records it.
 */
async function failDeliveryTerminally(options: {
  deliveryContext: WebhookDeliveryAttemptWithWebhook;
  organizationPublicId: string;
  reason: 'signing_secret_unreadable' | 'empty_signing_secret';
  error?: unknown;
  deliveryAttemptRepository?: WebhookDeliveryAttemptRepository | undefined;
}): Promise<never> {
  const { deliveryContext, reason } = options;
  const logFields = {
    webhookPublicId: deliveryContext.webhookPublicId,
    deliveryAttemptPublicId: deliveryContext.deliveryAttemptPublicId,
    eventType: deliveryContext.eventType,
    ...(options.error === undefined ? {} : { error: options.error }),
  };
  captureMessage(`webhook.delivery.${reason}`, { level: 'error', extra: logFields });
  logger.error(logFields, `webhook.delivery.${reason}`);
  await recordWebhookDeliveryOutcome({
    deliveryContext,
    organizationPublicId: options.organizationPublicId,
    deliveryAttemptRepository: options.deliveryAttemptRepository,
    outcome: { status: 'FAILED', response_body: reason, next_retry_at: null },
  });
  throw new UnrecoverableError(`webhook.delivery.${reason}`);
}

/**
 * Decrypts the webhook's signing secret, failing the delivery terminally when it cannot be read
 * or is empty.
 *
 * @remarks
 * Both are configuration faults no retry can fix. An unreadable secret (a rotated encryption key,
 * a corrupt value) used to throw out of the worker after the row was claimed: the row stayed
 * `SENDING`, the next attempt took it for a delivery in flight and completed the job, and the
 * event was never sent. P0-#1: an empty secret must never ship an unsigned payload — the receiver
 * could not tell it from a stripped signature.
 */
async function readSigningSecretOrFail(options: {
  deliveryContext: WebhookDeliveryAttemptWithWebhook;
  organizationPublicId: string;
  deliveryAttemptRepository?: WebhookDeliveryAttemptRepository | undefined;
}): Promise<string> {
  let signingSecret: string;
  try {
    signingSecret = decryptFieldSecret(options.deliveryContext.encryptedSecret);
  } catch (error) {
    return failDeliveryTerminally({ ...options, reason: 'signing_secret_unreadable', error });
  }
  if (signingSecret.length === 0) {
    return failDeliveryTerminally({ ...options, reason: 'empty_signing_secret' });
  }
  return signingSecret;
}

/** The status a receiver answers when an endpoint is permanently gone. */
const HTTP_STATUS_GONE = 410;

/**
 * Phase 2 (no DB context): HMAC-sign the payload and POST it through the per-webhook circuit
 * breaker / DNS-pinned fetch, then record the outcome via a fresh short transaction. Runs with
 * no open Postgres transaction so the up-to-~35s outbound call cannot starve the pool.
 */
async function deliverClaimedWebhook(options: {
  organizationPublicId: string;
  jobContext: WebhookDeliveryJobContext;
  fetchImplementation: WebhookDeliveryFetch;
  deliveryAttemptRepository?: WebhookDeliveryAttemptRepository | undefined;
  deliveryContext: WebhookDeliveryAttemptWithWebhook;
}): Promise<WebhookDeliveryJobResult> {
  const { organizationPublicId, jobContext, fetchImplementation, deliveryAttemptRepository } =
    options;
  const { deliveryContext } = options;
  const {
    webhookPublicId,
    webhookUrl,
    eventType,
    payload,
    encryptedSecretPrevious,
    secretRotatedAt,
    // sec-new-B2: opaque public identifier read from the DB row (generated once at
    // insert) — stable across BullMQ retries so receivers can use it as a dedupe
    // key without seeing the bigserial.
    deliveryAttemptPublicId,
  } = deliveryContext;
  const payloadString = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signingSecret = await readSigningSecretOrFail({
    deliveryContext,
    organizationPublicId,
    deliveryAttemptRepository,
  });
  const signature = signPayload(signingSecret, payloadString, timestamp);

  // sec-N8: dual-sign while inside the rotation overlap window so a customer who has not yet
  // rolled their verifier still sees a matching signature (decrypt failures drop the header).
  const previousSignatureHeader = computeWebhookPreviousSignatureHeader({
    encryptedSecretPrevious,
    secretRotatedAt,
    payloadString,
    timestamp,
    webhookPublicId,
  });

  const webhookUrlLogFields = safeWebhookUrlForLogs(webhookUrl);
  const logFields = {
    jobId: jobContext.id,
    requestId: jobContext.requestId,
    deliveryAttemptPublicId,
    webhookPublicId,
    eventType,
    ...webhookUrlLogFields,
    attempt: jobContext.attemptsMade + 1,
  };
  logger.info(logFields, 'webhook.delivery.sending');

  const recordOutcome = (
    outcome: Parameters<typeof recordWebhookDeliveryOutcome>[0]['outcome'],
    disableWebhook = false,
  ) =>
    recordWebhookDeliveryOutcome({
      deliveryContext,
      organizationPublicId,
      deliveryAttemptRepository,
      outcome,
      disableWebhook,
    });

  let response: Response;
  try {
    const pinnedFetch =
      fetchImplementation === defaultWebhookDeliveryFetch
        ? await createPinnedWebhookFetch(webhookUrl)
        : fetchImplementation;
    response = await outboundCall(
      buildOutboundCallOptions({
        name: 'webhook',
        circuit: null,
        requestId: jobContext.requestId,
        operation: async (signal) =>
          fetchWebhookWithCircuitBreaker({
            webhookPublicId,
            webhookUrl,
            init: {
              method: 'POST',
              headers: buildWebhookRequestHeaders({
                timestamp,
                signature,
                eventType,
                deliveryAttemptPublicId,
                previousSignatureHeader,
                requestId: jobContext.requestId,
              }),
              body: payloadString,
              signal,
            },
            fetchImplementation: pinnedFetch,
          }),
      }),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    await recordOutcome({
      status: 'FAILED',
      response_body: reason,
      next_retry_at: computeNextRetryAt(jobContext.attemptsMade),
    });
    throw new WebhookEndpointFailure(`webhook.delivery.request_failed: ${reason}`, {
      cause: error,
    });
  }

  const responseBody = await readWebhookResponseBodyOrPlaceholder({
    response,
    jobContext,
    deliveryContext,
    webhookUrlLogFields,
  });
  const httpStatus = response.status;

  if (httpStatus >= 200 && httpStatus < 300) {
    await recordOutcome({
      status: 'SENT',
      http_status_code: httpStatus,
      response_body: responseBody,
    });
    return { outcome: 'delivered', httpStatus };
  }

  if (httpStatus === HTTP_STATUS_GONE) {
    // The receiver says this endpoint will never accept another delivery: no retries, and the
    // webhook is turned off so later events stop going to it. Its owner re-enables it once fixed.
    await recordOutcome(
      {
        status: 'FAILED',
        http_status_code: httpStatus,
        response_body: responseBody,
        next_retry_at: null,
      },
      true,
    );
    logger.warn({ ...logFields, httpStatus }, 'webhook.delivery.endpoint_gone');
    return { outcome: 'endpoint_gone', httpStatus: HTTP_STATUS_GONE };
  }

  await recordOutcome({
    status: 'FAILED',
    http_status_code: httpStatus,
    response_body: responseBody,
    next_retry_at: computeNextRetryAt(jobContext.attemptsMade),
  });
  logger.warn({ ...logFields, httpStatus }, 'webhook.delivery.endpoint_failed');
  throw new WebhookEndpointFailure(`Webhook delivery failed with HTTP ${String(httpStatus)}`);
}

/**
 * Delivers a single webhook attempt (testable with an injected fetch implementation).
 *
 * @remarks
 * - **Algorithm:** three sequential phases, each owning its own short Postgres transaction so no
 *   pool checkout is held across the network call:
 *   1. **claim** (short txn) — load the attempt + webhook secret by the attempt's public id under
 *      `withAppDatabaseContext` and claim it (any status but `SENT` → `SENDING`);
 *   2. **deliver** (no DB context) — HMAC-SHA256 sign `<timestamp>.<payload>` and POST through
 *      the per-webhook circuit breaker / DNS-pinned fetch;
 *   3. **record** (short txn) — write `SENT` (2xx) or `FAILED` with the truncated response body.
 * - **Failure modes:** a receiver failure (non-2xx, timeout, refused connection) records `FAILED`
 *   with the next retry time and throws {@link WebhookEndpointFailure}: BullMQ retries on the
 *   delivery schedule (a minute, rising to ten hours — about a day in all) and the last failure
 *   reaches the dead-letter ledger without a page. `410 Gone` records `FAILED`, turns the webhook
 *   off and completes. An unreadable or empty signing secret, or a missing attempt row, throws
 *   `UnrecoverableError` (recorded and alerted). A disabled or deleted webhook records `FAILED`
 *   and skips.
 * - **Side effects:** outbound HTTPS POST; updates to `webhook_delivery_attempts` (and
 *   `webhooks.is_enabled` on a 410); structured logs at every transition.
 * - **Notes:** the dependency-injection seam (`fetchImplementation`, `deliveryAttemptRepository`)
 *   is exclusively for unit tests; production paths must use the pinned fetch and the
 *   worker-scoped repository factories.
 */
export async function processWebhookDeliveryAttempt(options: {
  deliveryAttemptPublicId: string;
  organizationPublicId: string;
  jobContext: WebhookDeliveryJobContext;
  fetchImplementation?: WebhookDeliveryFetch;
  deliveryAttemptRepository?: WebhookDeliveryAttemptRepository;
}): Promise<WebhookDeliveryJobResult> {
  const { deliveryAttemptPublicId, organizationPublicId, jobContext, deliveryAttemptRepository } =
    options;
  const claim = await claimWebhookDeliveryAttempt({
    deliveryAttemptPublicId,
    organizationPublicId,
    deliveryAttemptRepository,
  });

  if (claim.status === 'skipped') {
    logger.info(
      { deliveryAttemptPublicId, requestId: jobContext.requestId },
      `webhook.delivery.${claim.reason}`,
    );
    return { outcome: 'skipped', reason: claim.reason };
  }

  return deliverClaimedWebhook({
    organizationPublicId,
    jobContext,
    fetchImplementation: options.fetchImplementation ?? globalThis.fetch,
    deliveryAttemptRepository,
    deliveryContext: claim.deliveryContext,
  });
}

/**
 * Creates a BullMQ worker that delivers outbound webhooks with HMAC signing.
 *
 * @remarks
 * - **Algorithm:** registers a BullMQ worker on {@link WEBHOOK_DELIVERY_QUEUE_NAME} that parses
 *   the job payload through {@link webhookDeliveryJobDataSchema} and delegates to
 *   {@link processWebhookDeliveryAttempt}, which manages its own short organization-scoped
 *   transactions around (not across) the outbound HMAC-signed POST.
 * - **Failure modes:** receiver failures are persisted on the attempt row and rethrown so BullMQ
 *   retries up to {@link WEBHOOK_DELIVERY_JOB_ATTEMPTS} times using
 *   {@link webhookDeliveryBackoffWithJitter} (the delivery schedule plus up to 20% jitter); the
 *   final failure routes the job to the per-queue DLQ via the bootstrap dead-letter wiring.
 * - **Side effects:** subscribes a `Worker` to Redis with webhook-tuned options; performs
 *   outbound HTTPS calls via a pinned fetch wrapped in a per-webhook circuit breaker; writes the
 *   audit trail to `notify.webhook_delivery_attempts`.
 * - **Notes:** the worker never holds a Postgres pool checkout while the outbound request is in
 *   flight (claim and record run in separate short transactions); concurrency comes from
 *   `getWorkerConcurrencyWebhook()`; the returned handle is wired into bootstrap for graceful
 *   shutdown and lock release.
 */
export function createWebhookDeliveryWorker(): WorkerHandle {
  const worker = new Worker<WebhookDeliveryJobData>(
    WEBHOOK_DELIVERY_QUEUE_NAME,
    async (job) => {
      const { deliveryAttemptPublicId, organizationPublicId, requestId, traceparent, tracestate } =
        await parseJobDataOrDeadLetter({
          schema: webhookDeliveryJobDataSchema,
          job,
          queueName: WEBHOOK_DELIVERY_QUEUE_NAME,
        });
      return runWithPropagatedTraceContext({ traceparent, tracestate }, job.name, () =>
        processWebhookDeliveryAttempt({
          deliveryAttemptPublicId,
          organizationPublicId,
          jobContext: omitUndefined({
            id: job.id,
            attemptsMade: job.attemptsMade,
            requestId,
          }),
        }),
      );
    },
    {
      connection: getBullMQConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
      concurrency: getWorkerConcurrencyWebhook(),
      ...getWebhookWorkerOptions(),
      settings: {
        backoffStrategy: webhookDeliveryBackoffWithJitter,
      },
    },
  );

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId, queue: WEBHOOK_DELIVERY_QUEUE_NAME }, 'webhook.delivery.stalled');
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job?.id }, 'webhook.delivery.completed');
  });

  return buildWorkerHandle(worker, WEBHOOK_DELIVERY_QUEUE_NAME);
}
