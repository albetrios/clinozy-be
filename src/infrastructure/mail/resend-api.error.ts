/**
 * Resend errors about the email itself — its recipients, fields, attachment or idempotency key —
 * by HTTP status. Account and configuration errors (API key, sender domain, quota) and Resend
 * outages are not here: they fail every email alike.
 */
const PER_EMAIL_REJECTION_NAMES_BY_STATUS: Readonly<Record<number, readonly string[]>> = {
  409: ['invalid_idempotent_request'],
  422: ['validation_error', 'missing_required_field', 'invalid_attachment', 'invalid_parameter'],
};

/**
 * Resend returned a structured API error, or a send result without a message id.
 *
 * @remarks
 * - **Algorithm:** keeps Resend's HTTP status and error `name`. A per-email rejection
 *   ({@link ResendApiError.isPerEmailRejection}) sets `countsAsCircuitFailure` to false, so the
 *   `resend` circuit counts it as a success — Resend answered — and one bad address cannot open
 *   the circuit for every other email. Every other Resend error counts against the circuit.
 * - **Failure modes:** none — a value object.
 * - **Side effects:** none.
 * - **Notes:** the mail worker fails a per-email rejection for good (the outbox row is marked
 *   failed, no retries): sending the same email again cannot succeed.
 */
export class ResendApiError extends Error {
  /** HTTP status Resend answered with; null when unknown (e.g. a missing message id). */
  readonly statusCode: number | null;
  /** Resend's error code (`validation_error`, `invalid_api_key`, …); null when unknown. */
  readonly resendErrorName: string | null;
  /** Whether Resend refused this email for something about the email itself. */
  readonly isPerEmailRejection: boolean;
  /** Read by the circuit breaker (`countsAsCircuitFailure`): false for a per-email rejection. */
  readonly countsAsCircuitFailure: boolean;

  constructor(options: {
    message: string;
    statusCode?: number | null;
    resendErrorName?: string | null;
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
    this.countsAsCircuitFailure = !this.isPerEmailRejection;
  }
}
