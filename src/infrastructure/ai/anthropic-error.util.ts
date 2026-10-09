import { ExternalServiceError } from '@/infrastructure/outbound/outbound-error.js';

/** How long a throttle waits when Anthropic sends no `retry-after`. */
const DEFAULT_THROTTLE_RETRY_AFTER_MS = 60_000;

/** HTTP 529: Anthropic is overloaded — a throttle, not this request's fault. */
const OVERLOADED_STATUS = 529;

/** The `error` object of an Anthropic error answer (`{ type: "error", error: { type, message } }`). */
interface AnthropicErrorBody {
  type?: unknown;
  message?: unknown;
}

/**
 * An Anthropic Messages API error answer (launch D80) — classified once, so the circuit, the queue
 * pause and the job agree on what it means.
 *
 * @remarks
 * - **Algorithm:** a 429 or a 529 (overloaded) is a throttle — the queue waits `retry-after` (or a
 *   minute); any other 4xx except 401 / 403 is this request's own fault (an invalid request, a
 *   missing model) and does not count against the circuit; 401, 403 and 5xx count.
 * - **Failure modes:** none — an unreadable body keeps the HTTP status alone.
 * - **Notes:** the message is Anthropic's own words, at most 280 characters, for the log.
 */
export class AnthropicApiError extends Error {
  /** HTTP status Anthropic answered with. */
  readonly statusCode: number;
  /** Anthropic's error type (`invalid_request_error`, `overloaded_error`, …); null when absent. */
  readonly errorType: string | null;
  /** Whether Anthropic throttled the request — not an outage, not the request's fault. */
  readonly isRateLimited: boolean;
  /** Whether Anthropic refused this one request for something about it. */
  readonly isRequestRejection: boolean;
  /** How long to wait before the next request; set on a throttle. */
  readonly retryAfterMs: number | null;
  /** False for a throttle and a request refusal — read by the circuit breaker. */
  readonly countsAsCircuitFailure: boolean;
  /** Anthropic's own words, at most 280 characters. */
  readonly reason: string;

  constructor(options: { statusCode: number; body: string; retryAfterSeconds: string | null }) {
    const apiError = readApiError(options.body);
    const errorType = typeof apiError?.type === 'string' ? apiError.type : null;
    const message =
      typeof apiError?.message === 'string' && apiError.message.length > 0
        ? apiError.message
        : `Anthropic answered HTTP ${options.statusCode}`;
    super(`anthropic_error:${options.statusCode}:${errorType ?? 'none'}`);
    this.name = 'AnthropicApiError';
    this.statusCode = options.statusCode;
    this.errorType = errorType;
    this.isRateLimited = options.statusCode === 429 || options.statusCode === OVERLOADED_STATUS;
    this.isRequestRejection =
      !this.isRateLimited &&
      options.statusCode >= 400 &&
      options.statusCode < 500 &&
      options.statusCode !== 401 &&
      options.statusCode !== 403;
    const seconds = Number.parseInt(options.retryAfterSeconds ?? '', 10);
    const throttleWaitMs =
      Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : DEFAULT_THROTTLE_RETRY_AFTER_MS;
    this.retryAfterMs = this.isRateLimited ? throttleWaitMs : null;
    this.countsAsCircuitFailure = !(this.isRateLimited || this.isRequestRejection);
    this.reason = message.slice(0, 280);
  }
}

/** The `error` object of an answer body, or `null` when it is not JSON or has none. */
function readApiError(body: string): AnthropicErrorBody | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const error = (parsed as { error?: unknown }).error;
    return typeof error === 'object' && error !== null ? (error as AnthropicErrorBody) : null;
  } catch {
    return null;
  }
}

/**
 * The {@link AnthropicApiError} behind a failure — itself, or the cause of the
 * `ExternalServiceError` `outboundCall` wraps it in — or `null` for any other failure.
 *
 * @remarks
 * - **Notes:** pure; used by the circuit classifier and the ideas worker.
 */
export function findAnthropicApiError(error: unknown): AnthropicApiError | null {
  if (error instanceof AnthropicApiError) return error;
  if (error instanceof ExternalServiceError && error.cause instanceof AnthropicApiError) {
    return error.cause;
  }
  return null;
}

/**
 * Whether a failed Anthropic call counts against the `anthropic` circuit — a throttle and a refused
 * request do not (they say nothing about Anthropic being down); a timeout, a network failure, 401,
 * 403 and 5xx do.
 *
 * @remarks
 * - **Notes:** the outbound defaults' `countsAsCircuitFailure` for the `anthropic` integration.
 */
export function countsAnthropicErrorAsCircuitFailure(error: unknown): boolean {
  const apiError = findAnthropicApiError(error);
  return apiError === null ? true : apiError.countsAsCircuitFailure;
}
