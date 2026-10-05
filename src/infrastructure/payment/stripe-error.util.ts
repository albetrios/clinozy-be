import Stripe from 'stripe';
import {
  type AppError,
  ConflictError,
  ServiceUnavailableError,
  UnprocessableEntityError,
} from '@/shared/errors/index.js';

/**
 * Whether a Stripe error counts against the `stripe` circuit.
 *
 * @remarks
 * - **Algorithm:** Stripe refusing this one request — a declined card (`StripeCardError`), an
 *   invalid or not-found request (`StripeInvalidRequestError`, `resource_missing` included), an
 *   idempotency-key conflict (`StripeIdempotencyError`) — does not count: Stripe answered.
 *   Outages, timeouts, connection, authentication and permission errors and rate limits do.
 * - **Failure modes:** none — pure predicate.
 * - **Side effects:** none.
 * - **Notes:** the `stripe` integration default in `outbound-defaults.ts`, so it applies to every
 *   Stripe `outboundCall`: a burst of declined cards or not-found lookups cannot open the circuit
 *   for every other billing call. Lives apart from `stripe.client.ts` because the outbound
 *   defaults import it, and the client imports the outbound module.
 */
export function countsStripeErrorAsCircuitFailure(error: unknown): boolean {
  return !(
    error instanceof Stripe.errors.StripeCardError ||
    error instanceof Stripe.errors.StripeInvalidRequestError ||
    error instanceof Stripe.errors.StripeIdempotencyError
  );
}

/**
 * Whether Stripe answered that the requested object does not exist (`resource_missing`) — for an
 * event, one from another account or mode, or older than Stripe keeps. No retry can fetch it.
 */
export function isStripeResourceMissing(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeInvalidRequestError && error.code === 'resource_missing'
  );
}

/**
 * The client-facing error for a raw Stripe error that reached the HTTP layer, `null` for one that
 * is our own fault (it stays a 500 and reaches Sentry), or `undefined` when the error is not
 * Stripe's.
 *
 * @remarks
 * - **Algorithm:** a declined card → 422 `payment_declined`; an idempotency-key conflict → 422
 *   (the key was reused with other parameters); an object Stripe no longer has → 409
 *   `payment_provider_resource_missing` (our record is stale); a rate limit, an outage or a
 *   connection failure → 503 `errors:paymentProviderUnavailable`. An authentication or permission
 *   error, or any other invalid request, is our misconfiguration or bug → `null`.
 * - **Failure modes:** none — pure mapping.
 * - **Side effects:** none.
 * - **Notes:** the Stripe client rethrows Stripe's own errors (`rethrowIf`), so every HTTP path
 *   that calls Stripe reaches the error handler with one of these; before, all of them were 500s.
 */
export function toClientFacingStripeError(error: unknown): AppError | null | undefined {
  if (!(error instanceof Stripe.errors.StripeError)) return undefined;
  if (error instanceof Stripe.errors.StripeCardError) {
    return new UnprocessableEntityError('errors:paymentDeclined').withReason('payment_declined');
  }
  if (error instanceof Stripe.errors.StripeIdempotencyError) {
    return new UnprocessableEntityError('errors:idempotencyKeyReuse');
  }
  if (isStripeResourceMissing(error)) {
    return new ConflictError('errors:paymentProviderResourceMissing').withReason(
      'payment_provider_resource_missing',
    );
  }
  if (
    error instanceof Stripe.errors.StripeRateLimitError ||
    error instanceof Stripe.errors.StripeAPIError ||
    error instanceof Stripe.errors.StripeConnectionError
  ) {
    return new ServiceUnavailableError('errors:paymentProviderUnavailable');
  }
  return null;
}
