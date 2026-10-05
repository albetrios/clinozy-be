import Stripe from 'stripe';

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
