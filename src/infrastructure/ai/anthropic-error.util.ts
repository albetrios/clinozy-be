import { ExternalServiceError } from '@/infrastructure/outbound/outbound-error.js';
import { MILLISECONDS_PER_MINUTE } from '@/shared/constants/ttl.constants.js';

/** How long a throttle waits when Anthropic sends no `retry-after`. */
const DEFAULT_THROTTLE_RETRY_AFTER_MS = MILLISECONDS_PER_MINUTE;

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

/** The stop reasons that mean Claude did not finish its answer. */
export const ANTHROPIC_INCOMPLETE_STOP_REASONS = ['max_tokens', 'refusal'] as const;

/** A stop reason in {@link ANTHROPIC_INCOMPLETE_STOP_REASONS}. */
export type AnthropicIncompleteStopReason = (typeof ANTHROPIC_INCOMPLETE_STOP_REASONS)[number];

/**
 * Claude answered (HTTP 200) without finishing: it ran out of `max_tokens`, or declined to go on
 * (`stop_reason: "refusal"`). The text it did send is not an answer to read.
 *
 * @remarks
 * - **Notes:** thrown after the request has returned, so the `anthropic` circuit never counts it —
 *   Anthropic is up, this one answer is incomplete.
 */
export class AnthropicIncompleteAnswerError extends Error {
  /** Why Claude stopped. */
  readonly stopReason: AnthropicIncompleteStopReason;

  constructor(stopReason: AnthropicIncompleteStopReason) {
    super(`anthropic_answer_incomplete:${stopReason}`);
    this.name = 'AnthropicIncompleteAnswerError';
    this.stopReason = stopReason;
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
 * - **Notes:** pure; used by the ideas worker. The circuit reads the error's own
 *   `countsAsCircuitFailure`.
 */
export function findAnthropicApiError(error: unknown): AnthropicApiError | null {
  if (error instanceof AnthropicApiError) return error;
  if (error instanceof ExternalServiceError && error.cause instanceof AnthropicApiError) {
    return error.cause;
  }
  return null;
}
