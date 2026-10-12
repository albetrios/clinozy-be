import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  findMetaGraphApiError,
  MetaGraphApiError,
} from '@/infrastructure/messaging/meta-graph-error.util.js';
import {
  matchesMetaWebhookVerifyToken,
  verifyMetaWebhookSignature,
} from '@/infrastructure/messaging/meta-messaging.config.js';
import { ExternalServiceError } from '@/infrastructure/outbound/outbound-error.js';
import { countsAsCircuitFailure } from '@/infrastructure/resilience/circuit-breaker.js';

/** A Graph API error answer. */
function graphError(statusCode: number, code?: number, retryAfterSeconds: string | null = null) {
  return new MetaGraphApiError({
    statusCode,
    body: JSON.stringify({ error: { message: `Graph said ${statusCode}`, code } }),
    retryAfterSeconds,
  });
}

describe('MetaGraphApiError (launch D77)', () => {
  it("refuses one message on a 4xx — not the circuit's business", () => {
    const error = graphError(400, 131_026);
    expect([error.isMessageRejection, error.isRateLimited, error.countsAsCircuitFailure]).toEqual([
      true,
      false,
      false,
    ]);
    expect([error.metaErrorCode, error.reason]).toEqual([131_026, 'Graph said 400']);
  });

  it('throttles on a 429 or a rate-limit code, waiting as Meta asks (a minute otherwise)', () => {
    const answered = graphError(429, undefined, '12');
    expect([
      answered.isRateLimited,
      answered.retryAfterMs,
      answered.countsAsCircuitFailure,
    ]).toEqual([true, 12_000, false]);
    const coded = graphError(400, 130_429);
    expect([coded.isRateLimited, coded.isMessageRejection, coded.retryAfterMs]).toEqual([
      true,
      false,
      60_000,
    ]);
  });

  it('counts a revoked token and a 5xx against the circuit — they fail every message', () => {
    for (const statusCode of [401, 403, 500, 503]) {
      const error = graphError(statusCode, 190);
      expect([statusCode, error.isMessageRejection, error.countsAsCircuitFailure]).toEqual([
        statusCode,
        false,
        true,
      ]);
    }
  });

  it('reads a body that is not JSON as Meta answering with its status', () => {
    const error = new MetaGraphApiError({
      statusCode: 502,
      body: '<html>',
      retryAfterSeconds: null,
    });
    expect([error.metaErrorCode, error.reason]).toEqual([null, 'Graph API answered HTTP 502']);
  });

  it('finds the Graph error inside the outbound wrapper, and classifies for the circuit', () => {
    const inner = graphError(400, 100);
    const wrapped = new ExternalServiceError({
      integration: 'meta',
      category: 'http_4xx',
      status: 400,
      cause: inner,
    });
    expect(findMetaGraphApiError(wrapped)).toBe(inner);
    expect(findMetaGraphApiError(new Error('timeout'))).toBeNull();
    // The circuit sees the Graph error itself (outboundFetch wraps it only after the circuit).
    expect(countsAsCircuitFailure(inner)).toBe(false);
    expect(countsAsCircuitFailure(new Error('timeout'))).toBe(true);
  });
});

describe('the messaging webhook checks (launch D77)', () => {
  const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
  // nosemgrep: javascript.lang.security.audit.hardcoded-hmac-key.hardcoded-hmac-key — test fixture: a fake secret that signs a test body
  const signature = `sha256=${createHmac('sha256', 'test-meta-app-secret').update(body).digest('hex')}`;

  it("accepts Meta's signature of the raw body, in any hex case", () => {
    expect(verifyMetaWebhookSignature({ rawBody: body, signatureHeader: signature })).toBe(true);
    expect(
      verifyMetaWebhookSignature({
        rawBody: body,
        signatureHeader: `sha256=${signature.slice(7).toUpperCase()}`,
      }),
    ).toBe(true);
  });

  it('refuses another body, a malformed header, or the wrong length', () => {
    expect(
      verifyMetaWebhookSignature({ rawBody: Buffer.from('{}'), signatureHeader: signature }),
    ).toBe(false);
    expect(verifyMetaWebhookSignature({ rawBody: body, signatureHeader: signature.slice(7) })).toBe(
      false,
    );
    expect(verifyMetaWebhookSignature({ rawBody: body, signatureHeader: 'sha256=abc' })).toBe(
      false,
    );
  });

  it('matches only our verify token', () => {
    expect(matchesMetaWebhookVerifyToken('test-meta-webhook-verify-token')).toBe(true);
    expect(matchesMetaWebhookVerifyToken('test-meta-webhook-verify-tokens')).toBe(false);
    expect(matchesMetaWebhookVerifyToken('')).toBe(false);
  });
});
