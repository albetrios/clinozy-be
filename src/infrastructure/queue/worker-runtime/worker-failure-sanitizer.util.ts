import type { Worker } from 'bullmq';
import { sanitizeDatabaseError } from '@/shared/utils/security/sensitive-redaction.util.js';

/** BullMQ's per-job processor call: `callProcessJob(job, token, signal)` (a protected method). */
type CallProcessJob = (job: unknown, token: string, signal?: AbortSignal) => Promise<unknown>;

/** Workers whose processor call is already wrapped — the wrap is applied at most once. */
const sanitizedWorkers = new WeakSet<Worker>();

/**
 * Makes `worker` record a database failure as its sanitized form (C-1): a processor that throws
 * Drizzle's `Failed query: <sql> params: <values>` (or a node-postgres error whose `detail` quotes
 * the row) fails the job with {@link sanitizeDatabaseError}'s `{ name, code, constraint, table }`
 * error instead, so the bound values never reach the job's `failedReason` / `stacktrace` in Redis,
 * nor the `failed` listeners (dead-letter ledger, alerts).
 *
 * @remarks
 * - **Algorithm:** wraps the worker's own `callProcessJob` — the one call BullMQ's `processJob`
 *   makes for every job before `handleFailed` → `job.moveToFailed(err)` stores `err.message` and
 *   `err.stack` — and rethrows a caught error through {@link sanitizeDatabaseError}. Every other
 *   error (BullMQ's `UnrecoverableError`, `DelayedError`, the rate-limit sentinel) is rethrown
 *   unchanged, so BullMQ still recognises it.
 * - **Failure modes:** none of its own; the processor's error is always rethrown.
 * - **Side effects:** replaces `callProcessJob` on this instance only; idempotent per worker.
 * - **Notes:** applied by `buildWorkerHandle`, which every worker the runtime registers goes
 *   through, so the ~30 worker construction sites need no change. Call it right after constructing
 *   the worker (as `buildWorkerHandle` is), before the first job can be fetched.
 */
export function sanitizeWorkerFailures(worker: Worker): void {
  if (sanitizedWorkers.has(worker)) return;
  sanitizedWorkers.add(worker);
  // `callProcessJob` is protected in BullMQ's typings; it is the documented subclass hook, and an
  // own property on the instance takes precedence over the prototype method BullMQ calls.
  const processorHost = worker as unknown as { callProcessJob?: CallProcessJob };
  // A test double without BullMQ's method has nothing to wrap. A BullMQ upgrade that renamed it
  // fails the worker-failure-redaction integration test, which runs a real worker.
  if (typeof processorHost.callProcessJob !== 'function') return;
  const callProcessJob = processorHost.callProcessJob.bind(worker);
  processorHost.callProcessJob = async (job, token, signal) => {
    try {
      return await callProcessJob(job, token, signal);
    } catch (error) {
      throw sanitizeDatabaseError(error);
    }
  };
}
