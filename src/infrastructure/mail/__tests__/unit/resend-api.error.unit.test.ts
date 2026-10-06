import { describe, expect, it } from 'vitest';
import { ResendApiError, readResendRetryAfterMs } from '@/infrastructure/mail/resend-api.error.js';
import { countsAsCircuitFailure } from '@/infrastructure/resilience/circuit-breaker.js';

describe('ResendApiError', () => {
  it.each([
    [422, 'validation_error'],
    [422, 'missing_required_field'],
    [422, 'invalid_attachment'],
    [422, 'invalid_parameter'],
    [409, 'invalid_idempotent_request'],
  ])(
    'treats %i %s as a per-email rejection that does not count against the circuit',
    (statusCode, resendErrorName) => {
      const error = new ResendApiError({ message: 'refused', statusCode, resendErrorName });

      expect(error.isPerEmailRejection).toBe(true);
      expect(countsAsCircuitFailure(error)).toBe(false);
    },
  );

  it.each([
    // Account and configuration errors fail every email alike.
    [401, 'missing_api_key'],
    [403, 'invalid_api_key'],
    [403, 'validation_error'],
    [422, 'invalid_from_address'],
    // A spent quota lasts until it resets — an outage, not a throttle.
    [429, 'daily_quota_exceeded'],
    [429, 'monthly_quota_exceeded'],
    [409, 'concurrent_idempotent_requests'],
    // Resend itself failing.
    [500, 'application_error'],
  ])('counts %i %s against the circuit', (statusCode, resendErrorName) => {
    const error = new ResendApiError({ message: 'failed', statusCode, resendErrorName });

    expect(error.isPerEmailRejection).toBe(false);
    expect(countsAsCircuitFailure(error)).toBe(true);
  });

  it('counts an error without a status or name against the circuit', () => {
    const error = new ResendApiError({ message: 'resend.missing_message_id' });

    expect(error.statusCode).toBeNull();
    expect(error.resendErrorName).toBeNull();
    expect(error.isPerEmailRejection).toBe(false);
    expect(countsAsCircuitFailure(error)).toBe(true);
  });

  it('treats a 429 rate_limit_exceeded as a throttle that does not count against the circuit', () => {
    const error = new ResendApiError({
      message: 'Too many requests.',
      statusCode: 429,
      resendErrorName: 'rate_limit_exceeded',
      retryAfterMs: 3_000,
    });

    expect(error.isRateLimited).toBe(true);
    expect(error.isPerEmailRejection).toBe(false);
    expect(error.retryAfterMs).toBe(3_000);
    expect(countsAsCircuitFailure(error)).toBe(false);
  });

  it('waits one second on a throttle that does not say how long', () => {
    const error = new ResendApiError({
      message: 'Too many requests.',
      statusCode: 429,
      resendErrorName: 'rate_limit_exceeded',
    });

    expect(error.retryAfterMs).toBe(1_000);
  });
});

describe('readResendRetryAfterMs', () => {
  it('reads retry-after, then ratelimit-reset, in whole seconds, case-insensitively', () => {
    expect(readResendRetryAfterMs({ 'Retry-After': '4' })).toBe(4_000);
    expect(readResendRetryAfterMs({ 'ratelimit-reset': '2' })).toBe(2_000);
    expect(readResendRetryAfterMs({ 'retry-after': '0' })).toBe(1_000);
  });

  it('returns null when neither header is present or parseable', () => {
    expect(readResendRetryAfterMs(null)).toBeNull();
    expect(readResendRetryAfterMs({})).toBeNull();
    expect(readResendRetryAfterMs({ 'retry-after': 'soon' })).toBeNull();
  });
});
