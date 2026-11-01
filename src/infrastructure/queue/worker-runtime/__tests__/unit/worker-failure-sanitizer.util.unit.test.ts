import { UnrecoverableError, type Worker } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { sanitizeWorkerFailures } from '@/infrastructure/queue/worker-runtime/worker-failure-sanitizer.util.js';

/**
 * C-1: the runtime wraps BullMQ's per-job `callProcessJob` so a database failure is recorded only
 * in its sanitized form; every other error passes through untouched so BullMQ still recognises
 * `UnrecoverableError`, `DelayedError` and the rate-limit sentinel. The real Redis round trip is
 * `src/tests/integration/queue/worker-failure-redaction.integration.test.ts`.
 */

function workerDouble(callProcessJob: (...arguments_: unknown[]) => Promise<unknown>) {
  return { callProcessJob } as unknown as Worker & {
    callProcessJob: (job: unknown, token: string) => Promise<unknown>;
  };
}

/** A node-postgres server error shape: SQLSTATE code plus a `detail` that quotes the row. */
function postgresForeignKeyError(marker: string): Error {
  return Object.assign(new Error(`insert violates foreign key: ${marker}`), {
    name: 'error',
    code: '23503',
    severity: 'ERROR',
    constraint: 'organizations_owner_user_id_fkey',
    table: 'organizations',
    detail: `Key (owner_user_id)=(${marker}) is not present in table "users".`,
  });
}

describe('sanitizeWorkerFailures', () => {
  it('rethrows a database failure as its code, constraint and table only', async () => {
    const marker = 'Patient-marker-value';
    const worker = workerDouble(async () => {
      throw postgresForeignKeyError(marker);
    });
    sanitizeWorkerFailures(worker);

    const failure = await worker.callProcessJob({}, 'token').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/^Database query failed \(SQLSTATE 23503, /);
    expect(JSON.stringify(failure)).not.toContain(marker);
    expect((failure as Error).message).not.toContain(marker);
  });

  it('rethrows every other error unchanged, so BullMQ still recognises it', async () => {
    const unrecoverable = new UnrecoverableError('stripe.webhook.event_not_found:evt_1');
    const worker = workerDouble(async () => {
      throw unrecoverable;
    });
    sanitizeWorkerFailures(worker);

    await expect(worker.callProcessJob({}, 'token')).rejects.toBe(unrecoverable);
  });

  it('passes a result through and wraps a worker only once', async () => {
    const original = vi.fn(async () => 'done');
    const worker = workerDouble(original);
    sanitizeWorkerFailures(worker);
    const wrapped = worker.callProcessJob;
    sanitizeWorkerFailures(worker);

    expect(worker.callProcessJob).toBe(wrapped);
    await expect(worker.callProcessJob({ id: 'job-1' }, 'token')).resolves.toBe('done');
    expect(original).toHaveBeenCalledExactlyOnceWith({ id: 'job-1' }, 'token', undefined);
  });

  it('leaves a test double without BullMQ’s processor call alone', () => {
    const double = {} as Worker;
    expect(() => sanitizeWorkerFailures(double)).not.toThrow();
  });
});
