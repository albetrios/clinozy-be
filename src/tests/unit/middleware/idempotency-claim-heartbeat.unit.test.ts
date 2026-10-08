/**
 * The in-flight claim is a 60 second key the owner refreshes. A crashed process therefore
 * stops answering 409 within a minute, and a late completion cannot overwrite a newer claim.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  IDEMPOTENCY_PLACEHOLDER_MAX_HOLD_SECONDS,
  IDEMPOTENCY_PLACEHOLDER_REFRESH_INTERVAL_MS,
  IDEMPOTENCY_PLACEHOLDER_TTL_SECONDS,
  IDEMPOTENCY_RESPONSE_CACHE_TTL_SECONDS,
  MILLISECONDS_PER_SECOND,
} from '@/shared/constants/index.js';
import { buildIdempotencyRequestFingerprint } from '@/shared/utils/idempotency/idempotency-fingerprint.util.js';

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisIncr = vi.fn();
const mockRedisEval = vi.fn();
const mockLoggerWarn = vi.fn();

vi.mock('@/infrastructure/cache/redis.client.js', () => ({
  redisConnection: {
    get: (...arguments_: unknown[]) => mockRedisGet(...arguments_),
    set: (...arguments_: unknown[]) => mockRedisSet(...arguments_),
    incr: (...arguments_: unknown[]) => mockRedisIncr(...arguments_),
    del: vi.fn(),
    eval: (...arguments_: unknown[]) => mockRedisEval(...arguments_),
  },
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { warn: (...arguments_: unknown[]) => mockLoggerWarn(...arguments_), info: vi.fn() },
}));

const IDEMPOTENCY_KEY = 'heartbeat-key-1234567890';
const USER_ID = 'user-public';

function fingerprintForPost(): string {
  return buildIdempotencyRequestFingerprint({
    method: 'POST',
    routePath: '/',
    body: undefined,
  });
}

function refreshCalls(): unknown[][] {
  return mockRedisEval.mock.calls.filter((call) =>
    String(call[0]).includes("return redis.call('EXPIRE'"),
  );
}

function completionCalls(): unknown[][] {
  return mockRedisEval.mock.calls.filter((call) => String(call[0]).includes("redis.call('SET'"));
}

async function claimRequest(raw: EventEmitter = new EventEmitter()) {
  const idempotencyModule = await import('@/shared/middlewares/core/idempotency.middleware.js');
  const hooks: Record<string, unknown> = {};
  await idempotencyModule.default(
    {
      addHook: (hookName: string, handler: unknown) => {
        hooks[hookName] = handler;
      },
    } as never,
    {} as never,
  );
  const onRoute = hooks.onRoute as (routeOptions: {
    method: string;
    preHandler: unknown[];
  }) => void;
  const routeOptions = { method: 'POST', preHandler: [] as unknown[] };
  onRoute(routeOptions);
  const claimPreHandler = routeOptions.preHandler.at(-1) as (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<void>;
  const request = {
    method: 'POST',
    headers: { 'x-idempotency-key': IDEMPOTENCY_KEY },
    auth: { kind: 'user' as const, userId: USER_ID },
    _idempotencyKey: IDEMPOTENCY_KEY,
    id: 'req-owner',
  } as unknown as FastifyRequest & { _idempotencyClaimValue?: string };
  const reply = { sent: false, raw } as unknown as FastifyReply;
  await claimPreHandler(request, reply);
  return { request, reply, onResponse: idempotencyModule.idempotencyOnResponse };
}

beforeEach(() => {
  vi.useFakeTimers();
  mockRedisGet.mockReset().mockResolvedValue(null);
  mockRedisSet.mockReset().mockResolvedValue('OK');
  mockRedisIncr.mockReset().mockResolvedValue(1);
  mockRedisEval.mockReset().mockResolvedValue(1);
  mockLoggerWarn.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('idempotency claim heartbeat', () => {
  it('refreshes the claim on the interval and stops after the response', async () => {
    const { request, onResponse } = await claimRequest();
    const claimValue = request._idempotencyClaimValue;
    expect(claimValue).toEqual(expect.any(String));

    await vi.advanceTimersByTimeAsync(IDEMPOTENCY_PLACEHOLDER_REFRESH_INTERVAL_MS);
    expect(refreshCalls()).toHaveLength(1);
    expect(refreshCalls()[0]?.[3]).toBe(claimValue);
    expect(refreshCalls()[0]?.[4]).toBe(String(IDEMPOTENCY_PLACEHOLDER_TTL_SECONDS));

    await onResponse(request, { statusCode: 500 } as FastifyReply);
    await vi.advanceTimersByTimeAsync(IDEMPOTENCY_PLACEHOLDER_REFRESH_INTERVAL_MS);
    expect(refreshCalls()).toHaveLength(1);
  });

  it('stops refreshing when the raw response closes', async () => {
    const raw = new EventEmitter();
    await claimRequest(raw);
    raw.emit('close');

    await vi.advanceTimersByTimeAsync(IDEMPOTENCY_PLACEHOLDER_REFRESH_INTERVAL_MS * 2);
    expect(refreshCalls()).toHaveLength(0);
  });

  it('stops refreshing when the claim is no longer ours', async () => {
    mockRedisEval.mockImplementation(async (script: string) =>
      String(script).includes("return redis.call('EXPIRE'") ? 0 : 1,
    );
    await claimRequest();

    await vi.advanceTimersByTimeAsync(IDEMPOTENCY_PLACEHOLDER_REFRESH_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(IDEMPOTENCY_PLACEHOLDER_REFRESH_INTERVAL_MS);
    expect(refreshCalls()).toHaveLength(1);
  });

  it('logs a refresh error and keeps the timer', async () => {
    let refreshAttempts = 0;
    mockRedisEval.mockImplementation(async (script: string) => {
      if (String(script).includes("return redis.call('EXPIRE'")) {
        refreshAttempts += 1;
        if (refreshAttempts === 1) throw new Error('refresh down');
      }
      return 1;
    });
    await claimRequest();

    await vi.advanceTimersByTimeAsync(IDEMPOTENCY_PLACEHOLDER_REFRESH_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(IDEMPOTENCY_PLACEHOLDER_REFRESH_INTERVAL_MS);

    expect(refreshCalls()).toHaveLength(2);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      'idempotency.cache.refresh.failed',
    );
  });

  it('stops refreshing at the max hold', async () => {
    await claimRequest();
    await vi.advanceTimersByTimeAsync(
      IDEMPOTENCY_PLACEHOLDER_MAX_HOLD_SECONDS * MILLISECONDS_PER_SECOND,
    );
    const refreshesAtMaxHold = refreshCalls().length;
    expect(refreshesAtMaxHold).toBe(
      (IDEMPOTENCY_PLACEHOLDER_MAX_HOLD_SECONDS * MILLISECONDS_PER_SECOND) /
        IDEMPOTENCY_PLACEHOLDER_REFRESH_INTERVAL_MS -
        1,
    );

    await vi.advanceTimersByTimeAsync(IDEMPOTENCY_PLACEHOLDER_REFRESH_INTERVAL_MS);
    expect(refreshCalls()).toHaveLength(refreshesAtMaxHold);
  });

  it('writes the completed entry only through the fenced script', async () => {
    const { request, onResponse } = await claimRequest();
    const claimValue = request._idempotencyClaimValue;
    (
      request as FastifyRequest & {
        _idempotencyPendingCompleted?: {
          statusCode: number;
          body: string;
          headers: Record<string, string>;
        };
      }
    )._idempotencyPendingCompleted = {
      statusCode: 200,
      body: '{"ok":true}',
      headers: { 'content-type': 'application/json' },
    };

    await onResponse(request, { statusCode: 200 } as FastifyReply);

    const completion = completionCalls().at(-1);
    expect(completion?.[3]).toBe(claimValue);
    expect(String(completion?.[4])).toContain('"state":"completed"');
    expect(completion?.[5]).toBe(String(IDEMPOTENCY_RESPONSE_CACHE_TTL_SECONDS));
    expect(mockRedisSet).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite Redis when the completion loses the claim', async () => {
    mockRedisEval.mockImplementation(async (script: string) =>
      String(script).includes("redis.call('SET'") ? 0 : 1,
    );
    const { request, onResponse } = await claimRequest();
    (
      request as FastifyRequest & {
        _idempotencyRequestFingerprint?: string;
        _idempotencyPendingCompleted?: {
          statusCode: number;
          body: string;
          headers: Record<string, string>;
        };
      }
    )._idempotencyRequestFingerprint = fingerprintForPost();
    (
      request as FastifyRequest & {
        _idempotencyPendingCompleted?: {
          statusCode: number;
          body: string;
          headers: Record<string, string>;
        };
      }
    )._idempotencyPendingCompleted = {
      statusCode: 200,
      body: '{"ok":true}',
      headers: { 'content-type': 'application/json' },
    };

    await onResponse(request, { statusCode: 200 } as FastifyReply);

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: IDEMPOTENCY_KEY }),
      'idempotency.cache.claim_lost',
    );
    expect(mockRedisSet).toHaveBeenCalledTimes(1);
  });
});
