import { buildIdempotencyRequestFingerprint } from '@/shared/utils/idempotency/idempotency-fingerprint.util.js';

/** The request an idempotency entry belongs to — what its fingerprint is computed from. */
export interface IdempotencySeedRequest {
  method: string;
  /** The route template as Fastify reports it, API prefix included (`testApiPath('/uploads')`). */
  routePath: string;
  /**
   * The route's path parameters as Fastify parses them (`{ subscription_id: 'sub_…' }`) — the
   * middleware fingerprints `request.params`, so a route with a `:param` seeds them here.
   */
  pathParameters?: Record<string, string>;
  /** The request body as validated (schema defaults included); `undefined` when there is none. */
  body: unknown;
}

/**
 * An `in_flight` entry exactly as the idempotency preHandler writes it when it wins the claim, so
 * a test can drive the "someone else is already running this key" branch deterministically.
 */
export function buildInFlightIdempotencyEntry(request: IdempotencySeedRequest): string {
  return JSON.stringify({
    state: 'in_flight',
    claimedAt: Date.now(),
    requestId: 'req-first-caller',
    fingerprint: buildIdempotencyRequestFingerprint(request),
  });
}

/** Inputs for {@link buildCompletedIdempotencyEntry}. */
export interface CompletedIdempotencyEntrySeed {
  request: IdempotencySeedRequest;
  statusCode: number;
  /** The serialized response body the entry replays. */
  responseBody: string;
}

/** A `completed` entry exactly as the idempotency `onResponse` hook writes it after a 2xx. */
export function buildCompletedIdempotencyEntry(seed: CompletedIdempotencyEntrySeed): string {
  return JSON.stringify({
    state: 'completed',
    statusCode: seed.statusCode,
    body: seed.responseBody,
    headers: { 'content-type': 'application/json' },
    fingerprint: buildIdempotencyRequestFingerprint(seed.request),
  });
}
