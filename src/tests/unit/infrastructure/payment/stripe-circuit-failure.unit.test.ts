import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import {
  countsStripeErrorAsCircuitFailure,
  isStripeResourceMissing,
} from '@/infrastructure/payment/stripe-error.util.js';

describe('countsStripeErrorAsCircuitFailure', () => {
  it.each([
    [
      'a declined card',
      new Stripe.errors.StripeCardError({ message: 'Your card was declined.', type: 'card_error' }),
    ],
    [
      'a not-found lookup',
      new Stripe.errors.StripeInvalidRequestError({
        message: "No such customer: 'cus_missing'",
        type: 'invalid_request_error',
        code: 'resource_missing',
      }),
    ],
    [
      'an idempotency-key conflict',
      new Stripe.errors.StripeIdempotencyError({
        message: 'Keys for idempotent requests can only be used with the same parameters.',
        type: 'idempotency_error',
      }),
    ],
  ])('does not count %s — Stripe answered', (_label, error) => {
    expect(countsStripeErrorAsCircuitFailure(error)).toBe(false);
  });

  it.each([
    [
      'an outage',
      new Stripe.errors.StripeAPIError({ message: 'Internal error', type: 'api_error' }),
    ],
    ['a connection failure', new Stripe.errors.StripeConnectionError({ message: 'ECONNRESET' })],
    ['a bad API key', new Stripe.errors.StripeAuthenticationError({ message: 'Invalid API Key' })],
    ['a missing permission', new Stripe.errors.StripePermissionError({ message: 'Forbidden' })],
    ['a rate limit', new Stripe.errors.StripeRateLimitError({ message: 'Too many requests' })],
    ['an error that is not Stripe’s', new Error('socket hang up')],
  ])('counts %s against the circuit', (_label, error) => {
    expect(countsStripeErrorAsCircuitFailure(error)).toBe(true);
  });
});

describe('isStripeResourceMissing', () => {
  it('recognises Stripe answering that the object does not exist', () => {
    expect(
      isStripeResourceMissing(
        new Stripe.errors.StripeInvalidRequestError({
          message: "No such event: 'evt_missing'",
          type: 'invalid_request_error',
          code: 'resource_missing',
        }),
      ),
    ).toBe(true);
  });

  it.each([
    [
      'another invalid request',
      new Stripe.errors.StripeInvalidRequestError({
        message: 'Invalid parameter',
        type: 'invalid_request_error',
        code: 'parameter_invalid_empty',
      }),
    ],
    [
      'an outage',
      new Stripe.errors.StripeAPIError({ message: 'Internal error', type: 'api_error' }),
    ],
    ['an error that is not Stripe’s', new Error('resource_missing')],
  ])('does not take %s for a missing object', (_label, error) => {
    expect(isStripeResourceMissing(error)).toBe(false);
  });
});
