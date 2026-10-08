import { redisConnection } from '@/infrastructure/cache/redis.client.js';
import { env } from '@/shared/config/env.config.js';
import { BULLMQ_WEBHOOK_LOCK_DURATION_MS } from '@/shared/constants/ttl.constants.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/**
 * Thrown when a webhook delivery cannot start because its destination host already holds
 * `WEBHOOK_DELIVERY_MAX_IN_FLIGHT_PER_HOST` leases.
 * The worker parks the job; the attempt row is not marked failed.
 */
export class WebhookDeliveryHostAtCapacity extends Error {
  readonly host: string;

  constructor(host: string) {
    super('webhook.delivery.host_at_capacity');
    this.name = 'WebhookDeliveryHostAtCapacity';
    this.host = host;
  }
}

function defaultWebhookPort(protocol: string): string {
  if (protocol === 'https:') return '443';
  if (protocol === 'http:') return '80';
  return '';
}

/** Host label used when a webhook URL cannot be parsed. Deliveries still run; they share one bucket. */
export const WEBHOOK_DELIVERY_UNPARSED_DESTINATION_HOST = 'unparsed';

/**
 * Drops expired leases, refreshes this attempt's lease when it already holds one, otherwise
 * takes a free slot when the sorted set is under the cap.
 *
 * ARGV: now ms, lease-until ms, member, cap, lease ms. Returns 1 when this attempt holds a slot.
 */
const WEBHOOK_HOST_SLOT_ACQUIRE_LUA = `
local now = tonumber(ARGV[1])
local leaseUntil = tonumber(ARGV[2])
local member = ARGV[3]
local cap = tonumber(ARGV[4])
local leaseMs = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZSCORE', KEYS[1], member) then
  redis.call('ZADD', KEYS[1], leaseUntil, member)
  redis.call('PEXPIRE', KEYS[1], leaseMs)
  return 1
end
if redis.call('ZCARD', KEYS[1]) < cap then
  redis.call('ZADD', KEYS[1], leaseUntil, member)
  redis.call('PEXPIRE', KEYS[1], leaseMs)
  return 1
end
return 0
`;

/** Result of {@link acquireWebhookHostSlot}. `unavailable` means Redis failed and the caller delivers anyway. */
export type WebhookHostSlotAcquireResult = 'acquired' | 'busy' | 'unavailable';

/**
 * Lowercased `hostname:port` of a webhook URL, or null when the URL cannot be parsed.
 * An omitted port becomes 443 for https and 80 for http, so the two spellings share one lease.
 */
export function webhookDeliveryDestinationHost(webhookUrl: string): string | null {
  try {
    const parsed = new URL(webhookUrl);
    if (parsed.hostname.length === 0) {
      return null;
    }
    const port = parsed.port !== '' ? parsed.port : defaultWebhookPort(parsed.protocol);
    const hostname = parsed.hostname.toLowerCase();
    const hostLabel =
      hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
    return port === '' ? hostLabel : `${hostLabel}:${port}`;
  } catch {
    return null;
  }
}

/**
 * Destination host stored on a delivery job. Unparseable URLs share {@link WEBHOOK_DELIVERY_UNPARSED_DESTINATION_HOST}.
 */
export function resolveWebhookDeliveryDestinationHost(webhookUrl: string): string {
  return webhookDeliveryDestinationHost(webhookUrl) ?? WEBHOOK_DELIVERY_UNPARSED_DESTINATION_HOST;
}

/** Redis key for the leases of one destination host. The shared cache client applies its key prefix. */
export function webhookHostSlotKey(destinationHost: string): string {
  return `webhook:host-slots:${destinationHost}`;
}

/**
 * Takes or refreshes this attempt's lease on `destinationHost`.
 *
 * @remarks
 * The sorted-set member is the delivery attempt public id, so a retry of the same attempt
 * refreshes its lease instead of taking a second slot. Every worker replica shares the key.
 * A Redis error returns `unavailable` and the caller delivers: a cache outage must not stop
 * every webhook. The lease duration is {@link BULLMQ_WEBHOOK_LOCK_DURATION_MS}, matching the
 * BullMQ lock, so a crashed worker's slot expires with the job lock.
 */
export async function acquireWebhookHostSlot(options: {
  destinationHost: string;
  deliveryAttemptPublicId: string;
}): Promise<WebhookHostSlotAcquireResult> {
  const now = Date.now();
  const leaseMs = BULLMQ_WEBHOOK_LOCK_DURATION_MS;
  try {
    const acquired = await redisConnection.eval(
      WEBHOOK_HOST_SLOT_ACQUIRE_LUA,
      1,
      webhookHostSlotKey(options.destinationHost),
      String(now),
      String(now + leaseMs),
      options.deliveryAttemptPublicId,
      String(env.WEBHOOK_DELIVERY_MAX_IN_FLIGHT_PER_HOST),
      String(leaseMs),
    );
    return Number(acquired) === 1 ? 'acquired' : 'busy';
  } catch (error) {
    logger.warn(
      { error, destinationHost: options.destinationHost },
      'webhook.delivery.host_slot.unavailable',
    );
    return 'unavailable';
  }
}

/**
 * Drops this attempt's lease. A Redis error is logged; the lease expires on its own.
 */
export async function releaseWebhookHostSlot(options: {
  destinationHost: string;
  deliveryAttemptPublicId: string;
}): Promise<void> {
  try {
    await redisConnection.zrem(
      webhookHostSlotKey(options.destinationHost),
      options.deliveryAttemptPublicId,
    );
  } catch (error) {
    logger.warn(
      { error, destinationHost: options.destinationHost },
      'webhook.delivery.host_slot.release_failed',
    );
  }
}
