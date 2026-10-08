import {
  DelayedError,
  RateLimitError,
  UnrecoverableError,
  WaitingChildrenError,
  WaitingError,
  Worker,
  type Job,
  type RateLimiterOptions,
  type WorkerOptions,
} from 'bullmq';
import {
  CircuitBreakerOpenError,
  MANAGED_CIRCUIT_BREAKERS,
  countsAsCircuitFailure,
  type ManagedCircuitBreakerName,
} from '@/infrastructure/resilience/circuit-breaker.js';
import { getBullMQKeyPrefix } from '@/infrastructure/queue/connection.js';
import { PAUSE_SENTINEL_MAX_JOBS } from '@/infrastructure/queue/worker-runtime/provider-pause.util.js';
import { recordProviderOutageParkedJob } from '@/infrastructure/observability/metrics/prometheus-metrics.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  MILLISECONDS_PER_MINUTE,
  MILLISECONDS_PER_SECOND,
} from '@/shared/constants/ttl.constants.js';

/** A third-party provider a queue pauses for — each is guarded by its managed circuit breaker. */
export type QueueProvider = Exclude<ManagedCircuitBreakerName, 'turnstile'>;

/**
 * How long a queue stays paused once its provider is down. When it ends, the next job is the probe:
 * it succeeds and the queue drains, or it fails and the queue pauses for another five minutes.
 */
export const PROVIDER_OUTAGE_PAUSE_MS = 5 * MILLISECONDS_PER_MINUTE;

/**
 * The rate limiter every pausable worker declares — a million jobs a second, never reached.
 *
 * @remarks
 * BullMQ honours a queue-wide pause (`setRateLimit`) in its Lua only for a worker that declares a
 * limiter. Without one, the pause held only the replica that set it, and only until BullMQ's
 * 30-second `maximumRateLimitDelay` woke it; every other replica kept pulling jobs into the outage.
 */
export const PROVIDER_OUTAGE_PAUSABLE_LIMITER = {
  max: 1_000_000,
  duration: MILLISECONDS_PER_SECOND,
} as const;

/**
 * A job failed because its provider is down — or throttling us — not because of anything about
 * the job.
 *
 * @remarks
 * - **Algorithm:** carries the provider, the original error (`cause`) and, for a throttle, how long
 *   the provider asked us to wait (`retryAfterMs`, a 429's `Retry-After`). Built by
 *   {@link toProviderOutageError}; a processor that must settle its own state first (the mail
 *   processor releases its outbox claim instead of failing the row) throws it itself.
 * - **Failure modes:** none — a value object.
 * - **Side effects:** none.
 * - **Notes:** only a worker made by {@link createProviderPausableWorker} handles it: the queue
 *   pauses — `retryAfterMs` for a throttle, five minutes for an outage — and the job waits without
 *   spending an attempt.
 */
export class ProviderOutageError extends Error {
  /** The provider that is down, or throttling. */
  readonly provider: QueueProvider;
  /** How long the provider asked us to wait — set for a throttle, `null` for an outage. */
  readonly retryAfterMs: number | null;

  constructor(options: { provider: QueueProvider; cause: unknown; retryAfterMs?: number | null }) {
    super(`provider_outage:${options.provider}`, { cause: options.cause });
    this.name = 'ProviderOutageError';
    this.provider = options.provider;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

/** BullMQ's own control-flow errors and `UnrecoverableError` — never an outage, always passed on. */
function isBullMQControlError(error: unknown): boolean {
  return (
    error instanceof UnrecoverableError ||
    error instanceof DelayedError ||
    error instanceof RateLimitError ||
    error instanceof WaitingError ||
    error instanceof WaitingChildrenError
  );
}

/** Whether `error` — and the error it wraps, if any — counts against a circuit. */
function countsAgainstCircuit(error: unknown): boolean {
  if (!countsAsCircuitFailure(error)) return false;
  const cause =
    typeof error === 'object' && error !== null ? (error as { cause?: unknown }).cause : undefined;
  return cause === undefined || countsAsCircuitFailure(cause);
}

/**
 * The outage a job's failure means for `provider`, or `null` when the failure is the job's own.
 *
 * @remarks
 * - **Algorithm:** an open circuit for the provider is an outage — the call never left. Any other
 *   failure that counts against a circuit is an outage when, after it, the provider's circuit is
 *   not CLOSED: it tripped the circuit, or it was a half-open probe that failed. The first few
 *   failures that open a circuit, and a failure while it stays CLOSED, are the job's own and spend
 *   an attempt as before.
 * - **Failure modes:** never throws — the circuit read falls back to its in-memory state.
 * - **Side effects:** one Redis read of the circuit state, only for a failure that could be one.
 * - **Notes:** `UnrecoverableError` and BullMQ's control-flow errors are never an outage. A refusal
 *   of this one request (`countsAsCircuitFailure: false` — a declined card, a 404) is not either.
 *   While the circuit is not CLOSED, any other failure of the job counts as the outage: the job
 *   waits for the provider and is judged on its own once it is back.
 */
export async function toProviderOutageError(options: {
  error: unknown;
  provider: QueueProvider;
}): Promise<ProviderOutageError | null> {
  const { error, provider } = options;
  if (error instanceof ProviderOutageError) return error.provider === provider ? error : null;
  if (isBullMQControlError(error)) return null;
  if (error instanceof CircuitBreakerOpenError) {
    return error.circuitName === provider
      ? new ProviderOutageError({ provider, cause: error })
      : null;
  }
  if (!countsAgainstCircuit(error)) return null;
  const circuitState = await MANAGED_CIRCUIT_BREAKERS[provider].getState();
  return circuitState === 'CLOSED' ? null : new ProviderOutageError({ provider, cause: error });
}

/** Status code, Resend error name and error class of an outage's cause — never its message. */
function describeOutageCause(cause: unknown): Record<string, unknown> {
  if (typeof cause !== 'object' || cause === null) return { causeType: typeof cause };
  const record = cause as { name?: unknown; statusCode?: unknown; status?: unknown };
  return {
    causeName: typeof record.name === 'string' ? record.name : 'unknown',
    statusCode: record.statusCode ?? record.status,
    circuit: cause instanceof CircuitBreakerOpenError ? cause.circuitName : undefined,
  };
}

/** Options for {@link createProviderPausableWorker}: everything but the limiter and key prefix. */
export type ProviderPausableWorkerOptions = Omit<WorkerOptions, 'limiter' | 'prefix'>;

/**
 * Sets the queue-wide pause to `pauseMs` unless a longer one is already in place — a 1-second
 * throttle must not cut short a five-minute outage pause another job just set.
 */
async function extendQueuePause(options: {
  backend: {
    getRateLimitTtl(maxJobs?: number): Promise<number>;
    setRateLimit(expireTimeMs: number): Promise<void>;
  };
  pauseMs: number;
}): Promise<void> {
  const currentPauseMs = await options.backend.getRateLimitTtl(PAUSE_SENTINEL_MAX_JOBS);
  if (currentPauseMs >= options.pauseMs) return;
  await options.backend.setRateLimit(options.pauseMs);
}

/**
 * Creates the BullMQ worker for a queue whose jobs call one third-party provider. While that
 * provider is down the whole queue pauses — every replica — and retries every five minutes until
 * the provider is back; then everything that waited is processed.
 *
 * @remarks
 * - **Algorithm:** runs `processor`; when it fails with a provider outage
 *   ({@link toProviderOutageError}), sets the queue-wide pause (`setRateLimit`, enforced by the
 *   worker's limiter) and moves the job to `delayed` for the same time, without spending an attempt
 *   (`DelayedError`). The pause is five minutes for an outage and the provider's `Retry-After` for a
 *   throttle; it only ever extends a pause in place. The job lands at the back of the line, so a job
 *   that keeps failing as the probe cannot hold the queue: the job behind it probes next.
 * - **Failure modes:** a failure that is not an outage reaches BullMQ unchanged — its attempts,
 *   backoff and dead-letter queue apply as before. If the pause or the move fails (Redis), that
 *   error reaches BullMQ, which retries the job normally.
 * - **Side effects:** on an outage: a pause read and `SET` in Redis, one job move, a warn log
 *   (`queue.provider_outage.paused`; `queue.provider_throttle.paused` at info for a throttle) and
 *   `bullmq_provider_outage_parked_jobs_total{reason}`.
 * - **Notes:** for event-driven queues only. A scheduled sweep simply retries on its next tick.
 *   Webhook delivery does not use this queue-wide pause: one customer's endpoint being down is
 *   not an outage of every other customer's. A destination host already at its in-flight cap is
 *   parked per job with `moveToDelayed` and `DelayedError` (the same two calls) and is not a
 *   provider outage. `limiter` defaults to {@link PROVIDER_OUTAGE_PAUSABLE_LIMITER}; a queue
 *   that must also pace itself to a provider's rate limit passes its own (mail: Resend's
 *   requests per second). `pauseMs` exists so a test can shorten the pause.
 */
export function createProviderPausableWorker<TData, TResult = unknown>(options: {
  queueName: string;
  provider: QueueProvider;
  processor: (job: Job<TData>) => Promise<TResult>;
  workerOptions: ProviderPausableWorkerOptions;
  limiter?: RateLimiterOptions;
  pauseMs?: number;
}): Worker<TData, TResult> {
  const { queueName, provider } = options;
  const pauseMs = options.pauseMs ?? PROVIDER_OUTAGE_PAUSE_MS;
  const worker: Worker<TData, TResult> = new Worker<TData, TResult>(
    queueName,
    async (job, token) => {
      try {
        return await options.processor(job);
      } catch (error) {
        const outage = await toProviderOutageError({ error, provider });
        if (outage === null || token === undefined) throw error;
        const parkMs = outage.retryAfterMs ?? pauseMs;
        await extendQueuePause({ backend: worker.getBackend(), pauseMs: parkMs });
        await job.moveToDelayed(Date.now() + parkMs, token);
        const reason = outage.retryAfterMs === null ? 'outage' : 'throttle';
        recordProviderOutageParkedJob({ queue: queueName, provider, reason });
        const logFields = {
          queue: queueName,
          provider,
          jobId: job.id,
          pauseMs: parkMs,
          ...describeOutageCause(outage.cause),
        };
        if (reason === 'outage') logger.warn(logFields, 'queue.provider_outage.paused');
        else logger.info(logFields, 'queue.provider_throttle.paused');
        throw new DelayedError();
      }
    },
    {
      ...options.workerOptions,
      limiter: options.limiter ?? PROVIDER_OUTAGE_PAUSABLE_LIMITER,
      // The environment's BullMQ key namespace is not the caller's choice — see getBullMQKeyPrefix.
      prefix: getBullMQKeyPrefix(),
    },
  );
  return worker;
}
