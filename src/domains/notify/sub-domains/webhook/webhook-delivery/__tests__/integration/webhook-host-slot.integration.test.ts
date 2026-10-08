import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { connectRedis, redisConnection } from '@/infrastructure/cache/redis.client.js';
import {
  acquireWebhookHostSlot,
  releaseWebhookHostSlot,
  webhookHostSlotKey,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery-host-gate.js';

const DESTINATION_HOST = 'host-slot.example:443';
const SLOT_KEY = webhookHostSlotKey(DESTINATION_HOST);

/**
 * The cluster-wide webhook host lease: two callers share one Redis sorted set, an expired
 * score is reclaimed, and taking the same attempt again refreshes that member.
 */
describe('webhook host slot semaphore', () => {
  beforeAll(async () => {
    await connectRedis();
    await redisConnection.del(SLOT_KEY);
  });

  afterEach(async () => {
    await redisConnection.del(SLOT_KEY);
  });

  it('honors the cap across two callers', async () => {
    const first = await acquireWebhookHostSlot({
      destinationHost: DESTINATION_HOST,
      deliveryAttemptPublicId: 'wda_hostslotfirst0000001',
    });
    const second = await acquireWebhookHostSlot({
      destinationHost: DESTINATION_HOST,
      deliveryAttemptPublicId: 'wda_hostslotsecond000001',
    });
    const third = await acquireWebhookHostSlot({
      destinationHost: DESTINATION_HOST,
      deliveryAttemptPublicId: 'wda_hostslotthird0000001',
    });

    expect(first).toBe('acquired');
    expect(second).toBe('acquired');
    expect(third).toBe('busy');
    expect(await redisConnection.zcard(SLOT_KEY)).toBe(2);
  });

  it('reclaims a lease whose score is already in the past', async () => {
    await acquireWebhookHostSlot({
      destinationHost: DESTINATION_HOST,
      deliveryAttemptPublicId: 'wda_hostslotexpired00001',
    });
    await acquireWebhookHostSlot({
      destinationHost: DESTINATION_HOST,
      deliveryAttemptPublicId: 'wda_hostslotholder000001',
    });
    await redisConnection.zadd(SLOT_KEY, Date.now() - 1_000, 'wda_hostslotexpired00001');

    const reclaimed = await acquireWebhookHostSlot({
      destinationHost: DESTINATION_HOST,
      deliveryAttemptPublicId: 'wda_hostslotreclaimed0001',
    });

    expect(reclaimed).toBe('acquired');
    expect(await redisConnection.zscore(SLOT_KEY, 'wda_hostslotexpired00001')).toBeNull();
    expect(await redisConnection.zcard(SLOT_KEY)).toBe(2);
  });

  it('refreshes the same attempt without taking a second slot', async () => {
    const first = await acquireWebhookHostSlot({
      destinationHost: DESTINATION_HOST,
      deliveryAttemptPublicId: 'wda_hostslotrefresh00001',
    });
    const again = await acquireWebhookHostSlot({
      destinationHost: DESTINATION_HOST,
      deliveryAttemptPublicId: 'wda_hostslotrefresh00001',
    });
    const other = await acquireWebhookHostSlot({
      destinationHost: DESTINATION_HOST,
      deliveryAttemptPublicId: 'wda_hostslotother0000001',
    });

    expect(first).toBe('acquired');
    expect(again).toBe('acquired');
    expect(other).toBe('acquired');
    expect(await redisConnection.zcard(SLOT_KEY)).toBe(2);

    await releaseWebhookHostSlot({
      destinationHost: DESTINATION_HOST,
      deliveryAttemptPublicId: 'wda_hostslotrefresh00001',
    });
    expect(await redisConnection.zcard(SLOT_KEY)).toBe(1);
  });
});
