/**
 * Ack body returned to Stripe after a successful enqueue.
 * Stripe only needs a 2xx — `received: true` keeps the contract explicit for clients/observers.
 */
export interface StripeWebhookAcknowledgement {
  received: boolean;
}

/**
 * A Stripe event whose processing failed but which the ledger retries on its own: the row is
 * `failed` and the reclaim sweep re-enqueues it until STRIPE_WEBHOOK_MAX_PROCESSING_ATTEMPTS.
 *
 * @remarks
 * `expectedFinalFailure`: a job that runs out of BullMQ attempts with this error is recorded in
 * the dead-letter ledger at warn, without a page — the alert fires once, when the event is
 * abandoned. The original error is the `cause`.
 */
export class StripeWebhookRetryLaterError extends Error {
  /** Read by the dead-letter listener: record the final failure, but no Sentry page. */
  readonly expectedFinalFailure = true;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StripeWebhookRetryLaterError';
  }
}

/**
 * A failure no retry of the same event can fix — conflicting organization metadata, or an event
 * Stripe no longer has. The event is abandoned at once.
 */
export class StripeWebhookPermanentError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StripeWebhookPermanentError';
  }
}

/**
 * Thrown once the ledger row has been marked `abandoned` (a permanent failure, or the attempt
 * cap). The worker turns it into BullMQ's `UnrecoverableError`: recorded and alerted once.
 */
export class StripeWebhookEventAbandonedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StripeWebhookEventAbandonedError';
  }
}
