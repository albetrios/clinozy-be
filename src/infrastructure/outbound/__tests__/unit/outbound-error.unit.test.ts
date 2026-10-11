import { describe, it, expect } from 'vitest';
import { CircuitBreakerOpenError } from '@/infrastructure/resilience/circuit-breaker.js';
import {
  classifyOutboundError,
  ExternalServiceError,
  isOutboundRetryable,
  toClientFacingOutboundError,
} from '@/infrastructure/outbound/outbound-error.js';

describe('outbound-error', () => {
  it('classifies CircuitBreakerOpenError as circuit_open with retryAfterMs', () => {
    const error = classifyOutboundError({
      error: new CircuitBreakerOpenError('stripe', 15_000, 'open'),
      integration: 'stripe',
    });
    expect(error).toBeInstanceOf(ExternalServiceError);
    expect(error.category).toBe('circuit_open');
    expect(error.retryAfterMs).toBe(15_000);
  });

  it('classifies TimeoutError as timeout', () => {
    const timeoutError = new Error('The operation timed out');
    timeoutError.name = 'TimeoutError';
    const error = classifyOutboundError({ error: timeoutError, integration: 'resend' });
    expect(error.category).toBe('timeout');
  });

  it('isOutboundRetryable returns true for circuit_open ExternalServiceError', () => {
    const error = new ExternalServiceError({
      integration: 's3',
      category: 'circuit_open',
      retryAfterMs: 1_000,
    });
    expect(isOutboundRetryable(error)).toBe(true);
  });

  it('isOutboundRetryable returns false for http_4xx ExternalServiceError', () => {
    const error = new ExternalServiceError({
      integration: 'oauth-google',
      category: 'http_4xx',
      status: 401,
    });
    expect(isOutboundRetryable(error)).toBe(false);
  });

  it('ExternalServiceError carries Retry-After when the dependency says when to come back', () => {
    const error = classifyOutboundError({
      error: new CircuitBreakerOpenError('s3', 2_400, 'open'),
      integration: 's3',
    });
    expect(error.retryAfterSeconds).toBe(3);
  });

  it('ExternalServiceError for Stripe reads as the payment provider being unavailable', () => {
    const error = new ExternalServiceError({ integration: 'stripe', category: 'timeout' });
    expect(error.messageKey).toBe('errors:paymentProviderUnavailable');
    expect(new ExternalServiceError({ integration: 's3', category: 'timeout' }).messageKey).toBe(
      'errors:externalServiceUnavailable',
    );
  });

  it('toClientFacingOutboundError maps a raw open circuit to a 503 with Retry-After', () => {
    const stripeOpen = toClientFacingOutboundError(
      new CircuitBreakerOpenError('stripe', 500, 'open'),
    );
    expect(stripeOpen?.statusCode).toBe(503);
    expect(stripeOpen?.messageKey).toBe('errors:paymentProviderUnavailable');
    // Rounded up, never below one second.
    expect(stripeOpen?.retryAfterSeconds).toBe(1);

    const resendOpen = toClientFacingOutboundError(
      new CircuitBreakerOpenError('resend', 30_000, 'open'),
    );
    expect(resendOpen?.messageKey).toBe('errors:externalServiceUnavailable');
    expect(resendOpen?.retryAfterSeconds).toBe(30);
  });

  it('toClientFacingOutboundError leaves an error that is not a third-party failure alone', () => {
    expect(toClientFacingOutboundError(new Error('our bug'))).toBeNull();
  });
});
