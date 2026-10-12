import { ExternalServiceError } from '@/infrastructure/outbound/outbound-error.js';
import { MILLISECONDS_PER_MINUTE } from '@/shared/constants/ttl.constants.js';

/**
 * Graph API error codes that mean "slow down" — the app, the account or the WhatsApp number is
 * over a rate limit (Meta's error-code reference). A throttle, never an outage.
 */
const RATE_LIMIT_ERROR_CODES: ReadonlySet<number> = new Set([
  4, 17, 32, 613, 80_007, 130_429, 131_048, 131_056,
]);

/** Wait used when Meta throttles without saying how long. */
const DEFAULT_THROTTLE_RETRY_AFTER_MS = MILLISECONDS_PER_MINUTE;

/** The `error` object of a Graph API error body. */
interface GraphErrorBody {
  message?: unknown;
  code?: unknown;
  error_subcode?: unknown;
}

/**
 * The Graph API answered a messaging call with an error.
 *
 * @remarks
 * - **Algorithm:** keeps Meta's HTTP status, error `code` and message. A throttle (HTTP 429 or a
 *   rate-limit code) and a refusal of this one message (any other 4xx but 401 / 403 — an invalid
 *   recipient, a number not on WhatsApp, no Instagram conversation) set
 *   `countsAsCircuitFailure` to false, so the `meta` circuit counts them as Meta answering. An
 *   expired or revoked token (401 / 403), a 5xx and a network failure count — they fail every
 *   message alike.
 * - **Failure modes:** none — a value object.
 * - **Side effects:** none.
 * - **Notes:** the delivery worker marks a refused message `failed` with {@link MetaGraphApiError.reason}
 *   (no retry — sending it again cannot succeed) and pauses its queue on a throttle.
 */
export class MetaGraphApiError extends Error {
  /** HTTP status Meta answered with. */
  readonly statusCode: number;
  /** Meta's error code (`100`, `131026`, …); null when the body had none. */
  readonly metaErrorCode: number | null;
  /** Whether Meta throttled the request — not an outage, not the message's fault. */
  readonly isRateLimited: boolean;
  /** Whether Meta refused this one message for something about the message or its recipient. */
  readonly isMessageRejection: boolean;
  /** How long to wait before the next request; set on a throttle. */
  readonly retryAfterMs: number | null;
  /** False for a throttle and a message refusal — read by the circuit breaker. */
  readonly countsAsCircuitFailure: boolean;
  /** Meta's own words, for the message's `failure_reason` (at most 280 characters). */
  readonly reason: string;

  constructor(options: { statusCode: number; body: string; retryAfterSeconds: string | null }) {
    const graphError = readGraphError(options.body);
    const code = typeof graphError?.code === 'number' ? graphError.code : null;
    const message =
      typeof graphError?.message === 'string' && graphError.message.length > 0
        ? graphError.message
        : `Graph API answered HTTP ${options.statusCode}`;
    super(`meta_graph_error:${options.statusCode}:${code ?? 'none'}`);
    this.name = 'MetaGraphApiError';
    this.statusCode = options.statusCode;
    this.metaErrorCode = code;
    this.isRateLimited =
      options.statusCode === 429 || (code !== null && RATE_LIMIT_ERROR_CODES.has(code));
    this.isMessageRejection =
      !this.isRateLimited &&
      options.statusCode >= 400 &&
      options.statusCode < 500 &&
      options.statusCode !== 401 &&
      options.statusCode !== 403;
    const seconds = Number.parseInt(options.retryAfterSeconds ?? '', 10);
    const throttleWaitMs =
      Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : DEFAULT_THROTTLE_RETRY_AFTER_MS;
    this.retryAfterMs = this.isRateLimited ? throttleWaitMs : null;
    this.countsAsCircuitFailure = !(this.isRateLimited || this.isMessageRejection);
    this.reason = message.slice(0, 280);
  }
}

/** The `error` object of a Graph API error body, or `null` when the body is not one. */
function readGraphError(body: string): GraphErrorBody | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const error = (parsed as { error?: unknown }).error;
    return typeof error === 'object' && error !== null ? (error as GraphErrorBody) : null;
  } catch {
    return null;
  }
}

/**
 * The {@link MetaGraphApiError} behind a failed Graph call — the error itself, or the one an
 * `outboundCall` wrapped in an {@link ExternalServiceError} — else `null`.
 *
 * @remarks
 * - **Algorithm:** checks the error, then an `ExternalServiceError`'s `cause`.
 * - **Failure modes:** none.
 */
export function findMetaGraphApiError(error: unknown): MetaGraphApiError | null {
  if (error instanceof MetaGraphApiError) return error;
  if (error instanceof ExternalServiceError && error.cause instanceof MetaGraphApiError) {
    return error.cause;
  }
  return null;
}
