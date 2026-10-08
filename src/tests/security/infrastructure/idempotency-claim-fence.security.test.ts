/**
 * A request that finishes after its claim has been replaced must not publish its response
 * over the newer owner. The completion script writes only when the stored value is still
 * the original claim, or the key is already gone.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { connectRedis, redisConnection } from '@/infrastructure/cache/redis.client.js';
import { idempotencyOnResponse } from '@/shared/middlewares/core/idempotency.middleware.js';
import { buildIdempotencyCacheKey } from '@/shared/utils/idempotency/idempotency-key.util.js';

const IDEMPOTENCY_KEY = 'late-first-claim-1234567890';
const USER_ID = 'user-late-claim';

describe('Security: idempotency claim fence', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterEach(async () => {
    const cacheKey = buildIdempotencyCacheKey(IDEMPOTENCY_KEY, { userId: USER_ID });
    await redisConnection.del(cacheKey);
  });

  it('does not let a late first completion overwrite a second claim', async () => {
    const cacheKey = buildIdempotencyCacheKey(IDEMPOTENCY_KEY, { userId: USER_ID });
    const firstClaim = JSON.stringify({
      state: 'in_flight',
      claimedAt: 1,
      fingerprint: 'first',
    });
    const secondClaim = JSON.stringify({
      state: 'in_flight',
      claimedAt: 2,
      fingerprint: 'second',
    });
    await redisConnection.set(cacheKey, secondClaim, 'EX', 60);

    const request = {
      _idempotencyKey: IDEMPOTENCY_KEY,
      _idempotencyClaimed: true,
      _idempotencyClaimValue: firstClaim,
      _idempotencyRequestFingerprint: 'first',
      _idempotencyScope: { userId: USER_ID },
      _idempotencyPendingCompleted: {
        statusCode: 200,
        body: '{"from":"first"}',
        headers: { 'content-type': 'application/json' },
      },
    } as unknown as FastifyRequest;

    await idempotencyOnResponse(request, { statusCode: 200 } as FastifyReply);

    expect(await redisConnection.get(cacheKey)).toBe(secondClaim);
  });
});
