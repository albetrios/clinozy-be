/**
 * Resend errors about the email itself — its recipients, fields, attachment or idempotency key —
 * by HTTP status. Account and configuration errors (API key, sender domain, quota) and Resend
 * outages are not here: they fail every email alike.
 */
const PER_EMAIL_REJECTION_NAMES_BY_STATUS: Readonly<Record<number, readonly string[]>> = {
  409: ['invalid_idempotent_request'],
  422: ['validation_error', 'missing_required_field', 'invalid_attachment', 'invalid_parameter'],
};

/** Wait used when Resend throttles without saying how long (`retry-after` / `ratelimit-reset`). */
const DEFAULT_THROTTLE_RETRY_AFTER_MS = 1_000;

/**
 * How long Resend asked us to wait, from a 429's `retry-after` (else `ratelimit-reset`) header —
 * whole seconds — or `null` when neither is present and parseable.
 *
 * @remarks
 * Header names are matched case-insensitively. The value is clamped to at least one second.
 */
export function readResendRetryAfterMs(
  headers: Readonly<Record<string, string>> | null | undefined,
): number | null {
  if (!headers) return null;
  const headerValue = (name: string) =>
    Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
  const seconds = Number.parseInt(
    headerValue('retry-after') ?? headerValue('ratelimit-reset') ?? '',
    10,
  );
  return Number.isFinite(seconds) && seconds >= 0 ? Math.max(seconds, 1) * 1_000 : null;
}

/**
 * Resend returned a structured API error, or a send result without a message id.
 *
 * @remarks
 * - **Algorithm:** keeps Resend's HTTP status, error `name` and `retry-after`. A per-email rejection
 *   ({@link ResendApiError.isPerEmailRejection}) and a throttle — 429 `rate_limit_exceeded`
 *   ({@link ResendApiError.isRateLimited}) — set `countsAsCircuitFailure` to false, so the `resend`
 *   circuit counts them as a success: Resend answered. One bad address, or one burst over the rate
 *   limit, cannot open the circuit for every other email. Every other Resend error counts —
 *   including the daily and monthly quota 429s, which last until the quota resets.
 * - **Failure modes:** none — a value object.
 * - **Side effects:** none.
 * - **Notes:** the mail worker fails a per-email rejection for good (the outbox row is marked
 *   failed, no retries): sending the same email again cannot succeed. A throttle pauses the mail
 *   queue for `retryAfterMs` without spending the job's attempt.
 */
export class ResendApiError extends Error {
  /** HTTP status Resend answered with; null when unknown (e.g. a missing message id). */
  readonly statusCode: number | null;
  /** Resend's error code (`validation_error`, `invalid_api_key`, …); null when unknown. */
  readonly resendErrorName: string | null;
  /** Whether Resend refused this email for something about the email itself. */
  readonly isPerEmailRejection: boolean;
  /** Whether Resend throttled the request (429 `rate_limit_exceeded`) — not an outage. */
  readonly isRateLimited: boolean;
  /** How long Resend asked us to wait before the next request; set on a throttle. */
  readonly retryAfterMs: number | null;
  /** Read by the circuit breaker (`countsAsCircuitFailure`): false for a per-email rejection. */
  readonly countsAsCircuitFailure: boolean;

  constructor(options: {
    message: string;
    statusCode?: number | null;
    resendErrorName?: string | null;
    retryAfterMs?: number | null;
  }) {
    super(options.message);
    this.name = 'ResendApiError';
    this.statusCode = options.statusCode ?? null;
    this.resendErrorName = options.resendErrorName ?? null;
    this.isPerEmailRejection =
      this.statusCode !== null &&
      this.resendErrorName !== null &&
      (PER_EMAIL_REJECTION_NAMES_BY_STATUS[this.statusCode]?.includes(this.resendErrorName) ??
        false);
    this.isRateLimited = this.statusCode === 429 && this.resendErrorName === 'rate_limit_exceeded';
    this.retryAfterMs = this.isRateLimited
      ? (options.retryAfterMs ?? DEFAULT_THROTTLE_RETRY_AFTER_MS)
      : (options.retryAfterMs ?? null);
    this.countsAsCircuitFailure = !(this.isPerEmailRejection || this.isRateLimited);
  }
}
