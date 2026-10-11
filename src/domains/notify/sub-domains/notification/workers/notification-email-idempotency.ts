import type { Redis } from 'ioredis';
import { redisConnection } from '@/infrastructure/cache/redis.client.js';
import { NOTIFICATION_EMAIL_DISPATCH_IDEMPOTENCY_TTL_SECONDS } from '@/shared/constants/ttl.constants.js';

/** Redis key prefix for the one-time notification email-dispatch marker. */
const NOTIFICATION_EMAIL_DISPATCH_KEY_PREFIX = 'notification:email-dispatched:';

// Keyed by the notification's public id, not its bigserial: the id restarts at 1 after
// TRUNCATE ... RESTART IDENTITY or a database restore while this marker lives on in Redis for 24
// hours, so a NEW notification reusing the id would be skipped as "already dispatched".
function buildKey({
  notificationPublicId,
  recipient,
}: {
  notificationPublicId: string;
  recipient: string;
}): string {
  return `${NOTIFICATION_EMAIL_DISPATCH_KEY_PREFIX}${notificationPublicId}:${recipient.toLowerCase()}`;
}

/**
 * Reads whether a notification email was already durably dispatched (audit-#7).
 *
 * @remarks
 * - **Algorithm:** `GET key` → marker present means a prior run already persisted the mail-outbox
 *   row, so this run must skip to avoid a duplicate send.
 * - **Failure modes:** Redis errors propagate so the job retries rather than risking a double send.
 * - **Side effects:** none (read-only).
 * - **Notes:** paired with {@link markNotificationEmailDispatched}, which is written ONLY AFTER the
 *   durable outbox insert. This is the durability-first replacement for the claim-before-insert
 *   model that could lose an email on a crash between the claim and the insert. Keyed by the
 *   notification's public id, which stays unique when the bigserial restarts.
 */
export async function isNotificationEmailDispatched(options: {
  notificationPublicId: string;
  recipient: string;
  redis?: Redis;
}): Promise<boolean> {
  const { notificationPublicId, recipient } = options;
  const redis = options.redis ?? redisConnection;
  const result = await redis.get(buildKey({ notificationPublicId, recipient }));
  return result !== null;
}

/**
 * Marks a notification email as durably dispatched (audit-#7) — written only after the
 * mail-outbox row is persisted.
 *
 * @remarks
 * - **Algorithm:** `SET key 1 EX <ttl>` (no `NX`: the post-insert marker is set unconditionally
 *   so the dedup window survives concurrent runs converging on the same notification).
 * - **Failure modes:** Redis errors propagate; the durable outbox row already exists, so the
 *   mail-outbox sweeper still dispatches it even if marking fails.
 * - **Side effects:** writes a short-lived Redis key.
 * - **Notes:** because the marker is set AFTER the durable insert, a hard crash between the
 *   insert and this call can cause a rare duplicate on retry — an at-least-once trade chosen
 *   because a lost notification is worse than a rare duplicate.
 */
export async function markNotificationEmailDispatched(options: {
  notificationPublicId: string;
  recipient: string;
  redis?: Redis;
}): Promise<void> {
  const { notificationPublicId, recipient } = options;
  const redis = options.redis ?? redisConnection;
  await redis.set(
    buildKey({ notificationPublicId, recipient }),
    '1',
    'EX',
    NOTIFICATION_EMAIL_DISPATCH_IDEMPOTENCY_TTL_SECONDS,
  );
}
