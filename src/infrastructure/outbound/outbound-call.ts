import {
  CircuitBreakerOpenError,
  type CircuitBreaker,
} from '@/infrastructure/resilience/circuit-breaker.js';
import {
  isTransientNetworkError,
  retryWithBackoff,
  type RetryWithBackoffOptions,
} from '@/infrastructure/resilience/retry-with-backoff.util.js';
import {
  classifyOutboundError,
  type ExternalServiceError,
  recordOutboundFailureBreadcrumb,
} from '@/infrastructure/outbound/outbound-error.js';
import {
  resolveOutboundDefaults,
  type OutboundIntegrationName,
} from '@/infrastructure/outbound/outbound-defaults.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';

/**
 * Looser form of {@link OutboundCallOptions} that allows explicit `undefined` on each
 * optional field so callers can spread partial values without tripping
 * `exactOptionalPropertyTypes`. Pipe through {@link buildOutboundCallOptions} to drop
 * the `undefined` keys before invoking {@link outboundCall}.
 */
export type OutboundCallOptionsInput<T> = {
  name: OutboundIntegrationName;
  operation: (signal: AbortSignal) => Promise<T>;
  timeoutMs?: number | undefined;
  circuit?: CircuitBreaker | null | undefined;
  retry?: OutboundCallRetryOptions | undefined;
  requestId?: string | undefined;
  enforceAbortTimeout?: boolean | undefined;
  rethrowIf?: ((error: unknown) => boolean) | undefined;
  countsAsCircuitFailure?: ((error: unknown) => boolean) | undefined;
};

/**
 * Strips `undefined` properties from {@link OutboundCallOptionsInput} so the resulting
 * object is assignable to {@link OutboundCallOptions} under strict optional-property typing.
 */
export function buildOutboundCallOptions<T>(
  options: OutboundCallOptionsInput<T>,
): OutboundCallOptions<T> {
  return omitUndefined(options) as OutboundCallOptions<T>;
}

/**
 * Retry policy for {@link outboundCall} — exponential backoff with jitter applied inside
 * a single circuit-breaker `execute()` so retries do not multiply the failure count.
 */
export interface OutboundCallRetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * Resolved options consumed by {@link outboundCall}. Use {@link buildOutboundCallOptions}
 * to construct one from the looser {@link OutboundCallOptionsInput} shape.
 */
export interface OutboundCallOptions<T> {
  name: OutboundIntegrationName;
  /** Per attempt: each retry gets its own timeout (the integration default when omitted). */
  timeoutMs?: number;
  circuit?: CircuitBreaker | null;
  retry?: OutboundCallRetryOptions;
  requestId?: string;
  /** When false, the operation is not aborted by a façade timeout (e.g. Stripe SDK timeout). */
  enforceAbortTimeout?: boolean;
  /** When true, the error is logged and rethrown without wrapping in {@link ExternalServiceError}. */
  rethrowIf?: (error: unknown) => boolean;
  /**
   * Returns false for a third-party error that is the upstream refusing this one request (Stripe
   * declining a card, S3 answering 404, say): the error is tagged `countsAsCircuitFailure: false`,
   * so the circuit counts the call as a success. Defaults to the integration's classifier
   * (`outbound-defaults.ts`); our own error classes carry the property themselves.
   */
  countsAsCircuitFailure?: (error: unknown) => boolean;
  operation: (signal: AbortSignal) => Promise<T>;
}

function resolveAbortSignal(options: {
  timeoutMs: number;
  enforceAbortTimeout: boolean;
}): AbortSignal {
  if (!options.enforceAbortTimeout) {
    return new AbortController().signal;
  }
  return AbortSignal.timeout(options.timeoutMs);
}

/**
 * Runs the operation — once, or under `retry` — giving every attempt its own timeout signal. One
 * signal shared across attempts let a first attempt that timed out abort every retry at once, so
 * retrying after a timeout never actually retried.
 */
async function runOperationWithOptionalRetry<T>(options: {
  operation: (signal: AbortSignal) => Promise<T>;
  createAttemptSignal: () => AbortSignal;
  retry?: OutboundCallRetryOptions;
}): Promise<T> {
  const { operation, createAttemptSignal, retry } = options;
  if (!retry) {
    return operation(createAttemptSignal());
  }

  const retryOptions = omitUndefined({
    maxAttempts: retry.maxAttempts,
    baseDelayMs: retry.baseDelayMs,
    maxDelayMs: retry.maxDelayMs,
    jitterRatio: retry.jitterRatio,
    shouldRetry:
      retry.shouldRetry ??
      ((error: unknown) =>
        !(error instanceof CircuitBreakerOpenError) && isTransientNetworkError(error)),
  }) as RetryWithBackoffOptions;

  return retryWithBackoff(() => operation(createAttemptSignal()), retryOptions);
}

/** Tags a third-party error so the circuit breaker counts it as a success (see `countsAsCircuitFailure`). */
function markAsRefusalOfRequest(error: unknown): void {
  if (typeof error === 'object' && error !== null) {
    Object.assign(error, { countsAsCircuitFailure: false });
  }
}

function logOutboundFailure(options: {
  integration: OutboundIntegrationName;
  error: ExternalServiceError;
  requestId?: string;
  attempt?: number;
  durationMs: number;
  transient: boolean;
}): void {
  const payload = {
    integration: options.integration,
    category: options.error.category,
    requestId: options.requestId,
    attempt: options.attempt,
    durationMs: options.durationMs,
    status: options.error.status,
    retryAfterMs: options.error.retryAfterMs,
  };

  if (options.transient) {
    logger.warn(payload, 'outbound.call.failed.transient');
  } else {
    logger.error(payload, 'outbound.call.failed');
  }
}

/**
 * Executes an outbound operation with optional circuit breaker, timeout, retry, and
 * uniform error classification. Retry runs inside a single circuit `execute()` when both are set;
 * the timeout applies to each attempt, not to the call as a whole.
 */
export async function outboundCall<T>(options: OutboundCallOptions<T>): Promise<T> {
  const resolved = buildOutboundCallOptions(options);

  const defaults = resolveOutboundDefaults(resolved.name);
  const timeoutMs = resolved.timeoutMs ?? defaults.timeoutMs;
  const circuit = resolved.circuit === null ? undefined : (resolved.circuit ?? defaults.circuit);
  const enforceAbortTimeout = resolved.enforceAbortTimeout ?? true;
  const startedAt = Date.now();

  const executeOnce = async (): Promise<T> => {
    const run = async (): Promise<T> =>
      runOperationWithOptionalRetry(
        omitUndefined({
          operation: resolved.operation,
          createAttemptSignal: () => resolveAbortSignal({ timeoutMs, enforceAbortTimeout }),
          retry: resolved.retry,
        }),
      );

    if (circuit) {
      const countsAsCircuitFailure =
        resolved.countsAsCircuitFailure ?? defaults.countsAsCircuitFailure;
      if (!countsAsCircuitFailure) {
        return circuit.execute(run);
      }
      return circuit.execute(async () => {
        try {
          return await run();
        } catch (error) {
          if (!countsAsCircuitFailure(error)) markAsRefusalOfRequest(error);
          throw error;
        }
      });
    }
    return run();
  };

  try {
    return await executeOnce();
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError || resolved.rethrowIf?.(error)) {
      const externalError = classifyOutboundError(error, resolved.name);
      const durationMs = Date.now() - startedAt;
      logOutboundFailure(
        omitUndefined({
          integration: resolved.name,
          error: externalError,
          requestId: resolved.requestId,
          durationMs,
          transient: error instanceof CircuitBreakerOpenError,
        }),
      );
      recordOutboundFailureBreadcrumb(
        omitUndefined({
          integration: resolved.name,
          category: externalError.category,
          requestId: resolved.requestId,
          durationMs,
          status: externalError.status,
        }),
      );
      throw error;
    }

    const externalError = classifyOutboundError(error, resolved.name);
    const durationMs = Date.now() - startedAt;
    const transient = isTransientNetworkError(error) || error instanceof CircuitBreakerOpenError;

    logOutboundFailure(
      omitUndefined({
        integration: resolved.name,
        error: externalError,
        requestId: resolved.requestId,
        durationMs,
        transient,
      }),
    );

    recordOutboundFailureBreadcrumb(
      omitUndefined({
        integration: resolved.name,
        category: externalError.category,
        requestId: resolved.requestId,
        durationMs,
        status: externalError.status,
      }),
    );

    throw externalError;
  }
}
