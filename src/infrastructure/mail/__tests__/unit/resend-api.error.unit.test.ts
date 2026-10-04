import { describe, expect, it } from 'vitest';
import { ResendApiError } from '@/infrastructure/mail/resend-api.error.js';
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
    [429, 'rate_limit_exceeded'],
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
});
