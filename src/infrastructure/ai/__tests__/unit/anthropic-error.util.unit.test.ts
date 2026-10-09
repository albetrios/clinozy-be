import { describe, expect, it } from 'vitest';
import {
  AnthropicApiError,
  countsAnthropicErrorAsCircuitFailure,
  findAnthropicApiError,
} from '@/infrastructure/ai/anthropic-error.util.js';
import { ExternalServiceError } from '@/infrastructure/outbound/outbound-error.js';

/** A Messages API error answer. */
function anthropicError(statusCode: number, retryAfterSeconds: string | null = null) {
  return new AnthropicApiError({
    statusCode,
    body: JSON.stringify({
      type: 'error',
      error: { type: 'some_error', message: `Anthropic said ${statusCode}` },
    }),
    retryAfterSeconds,
  });
}

/** How an Anthropic error answer is classified (launch D80). */
describe('AnthropicApiError', () => {
  it('reads 429 and 529 as a throttle, waiting retry-after or a minute', () => {
    const throttled = anthropicError(429, '5');
    expect([
      throttled.isRateLimited,
      throttled.retryAfterMs,
      throttled.countsAsCircuitFailure,
    ]).toEqual([true, 5_000, false]);
    const overloaded = anthropicError(529, 'soon');
    expect([overloaded.isRateLimited, overloaded.retryAfterMs]).toEqual([true, 60_000]);
  });

  it("refuses one request on another 4xx — not the circuit's business", () => {
    for (const statusCode of [400, 404, 413, 422]) {
      const error = anthropicError(statusCode);
      expect([statusCode, error.isRequestRejection, error.countsAsCircuitFailure]).toEqual([
        statusCode,
        true,
        false,
      ]);
      expect(error.retryAfterMs).toBeNull();
    }
  });

  it('counts a bad key, a forbidden key and a 5xx against the circuit', () => {
    for (const statusCode of [401, 403, 500, 503]) {
      const error = anthropicError(statusCode);
      expect([statusCode, error.isRequestRejection, error.countsAsCircuitFailure]).toEqual([
        statusCode,
        false,
        true,
      ]);
    }
  });

  it("keeps Anthropic's type and words, and only its status when the body is not JSON", () => {
    const error = anthropicError(500);
    expect([error.errorType, error.reason, error.message]).toEqual([
      'some_error',
      'Anthropic said 500',
      'anthropic_error:500:some_error',
    ]);
    const bare = new AnthropicApiError({
      statusCode: 502,
      body: '<html>Bad gateway</html>',
      retryAfterSeconds: null,
    });
    expect([bare.errorType, bare.reason]).toEqual([null, 'Anthropic answered HTTP 502']);
  });

  it('cuts a long message to 280 characters', () => {
    const error = new AnthropicApiError({
      statusCode: 400,
      body: JSON.stringify({ error: { type: 'x', message: 'y'.repeat(500) } }),
      retryAfterSeconds: null,
    });
    expect(error.reason).toHaveLength(280);
  });
});

describe('findAnthropicApiError / countsAnthropicErrorAsCircuitFailure', () => {
  it('finds the error itself or inside the outbound wrapper', () => {
    const error = anthropicError(429);
    const wrapped = new ExternalServiceError({
      integration: 'anthropic',
      category: 'http_4xx',
      status: 429,
      cause: error,
    });
    expect(findAnthropicApiError(error)).toBe(error);
    expect(findAnthropicApiError(wrapped)).toBe(error);
    expect(findAnthropicApiError(new Error('timeout'))).toBeNull();
  });

  it('counts a timeout or network failure, but not a throttle or a refused request', () => {
    expect(countsAnthropicErrorAsCircuitFailure(new Error('socket hang up'))).toBe(true);
    expect(countsAnthropicErrorAsCircuitFailure(anthropicError(429))).toBe(false);
    expect(countsAnthropicErrorAsCircuitFailure(anthropicError(400))).toBe(false);
    expect(countsAnthropicErrorAsCircuitFailure(anthropicError(500))).toBe(true);
  });
});
