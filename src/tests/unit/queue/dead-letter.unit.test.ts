import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, Worker } from 'bullmq';

const queueAddMock = vi.fn().mockResolvedValue(undefined);
const queueCloseMock = vi.fn().mockResolvedValue(undefined);
const queueGetWaitingCountMock = vi.fn().mockResolvedValue(0);
const queueCleanMock = vi.fn().mockResolvedValue([]);
const queueConstructorArgsMock: { name: string; options: unknown }[] = [];
const sentryCaptureExceptionMock = vi.fn();
const insertDeadLetterJobMock = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => ({
  // P0-#6 regression: capture every Queue() constructor call so we can lock in the
  // retention bounds applied to `*-dlq` queues. A regression here (removing the age
  // bound, or making it absurdly large) silently turns the DLQ into an unbounded
  // Redis sink — exactly the failure mode the recon flagged.
  Queue: class MockQueue {
    name: string;

    constructor(name: string, options: unknown) {
      this.name = name;
      queueConstructorArgsMock.push({ name, options });
    }

    add = queueAddMock;

    close = queueCloseMock;

    getWaitingCount = queueGetWaitingCountMock;

    clean = (...arguments_: unknown[]) => queueCleanMock(this.name, ...arguments_);
  },
  UnrecoverableError: class UnrecoverableError extends Error {},
}));

vi.mock('@/infrastructure/queue/dlq/dead-letter.repository.js', () => ({
  insertDeadLetterJob: (...arguments_: unknown[]) => insertDeadLetterJobMock(...arguments_),
}));

vi.mock('@/infrastructure/observability/sentry/sentry.js', () => ({
  isSentryInitialized: () => true,
  Sentry: {
    withScope: (callback: (scope: unknown) => void) => {
      callback({
        setLevel: vi.fn(),
        setFingerprint: vi.fn(),
        setTag: vi.fn(),
      });
    },
    captureException: (...arguments_: unknown[]) => sentryCaptureExceptionMock(...arguments_),
  },
}));

describe('dead-letter helpers', () => {
  afterEach(async () => {
    queueAddMock.mockClear();
    queueCloseMock.mockClear();
    queueGetWaitingCountMock.mockReset();
    queueGetWaitingCountMock.mockResolvedValue(0);
    queueCleanMock.mockReset();
    queueCleanMock.mockResolvedValue([]);
    queueConstructorArgsMock.length = 0;
    sentryCaptureExceptionMock.mockClear();
    insertDeadLetterJobMock.mockClear();
    insertDeadLetterJobMock.mockResolvedValue(undefined);
    const { closeDeadLetterQueues } = await import('@/infrastructure/queue/dlq/dead-letter.js');
    await closeDeadLetterQueues();
    vi.resetModules();
  });

  describe('isFinalJobFailure', () => {
    it('returns false when job is undefined', async () => {
      const { isFinalJobFailure } = await import('@/infrastructure/queue/dlq/dead-letter.js');
      expect(isFinalJobFailure(undefined)).toBe(false);
    });

    it('returns false when attempts remain', async () => {
      const { isFinalJobFailure } = await import('@/infrastructure/queue/dlq/dead-letter.js');
      const job = {
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;
      expect(isFinalJobFailure(job)).toBe(false);
    });

    it('returns true when attempts are exhausted', async () => {
      const { isFinalJobFailure } = await import('@/infrastructure/queue/dlq/dead-letter.js');
      const job = {
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as Job;
      expect(isFinalJobFailure(job)).toBe(true);
    });

    it('treats missing opts.attempts as 1', async () => {
      const { isFinalJobFailure } = await import('@/infrastructure/queue/dlq/dead-letter.js');
      const job = {
        attemptsMade: 1,
        opts: {},
      } as Job;
      expect(isFinalJobFailure(job)).toBe(true);
    });

    // BullMQ stores `attempts: 0` on jobs added without the option (cron/repeatable jobs from the
    // scheduler included) — that is its "no retries" encoding, i.e. exactly one attempt.
    it('treats opts.attempts 0 (BullMQ default) as a single attempt', async () => {
      const { isFinalJobFailure, resolveJobMaxAttempts } = await import(
        '@/infrastructure/queue/dlq/dead-letter.js'
      );
      const job = { attemptsMade: 1, opts: { attempts: 0 } } as Job;
      expect(resolveJobMaxAttempts(job)).toBe(1);
      expect(isFinalJobFailure(job)).toBe(true);
    });
  });

  describe('getDeadLetterQueueName', () => {
    it('appends -dlq suffix', async () => {
      const { getDeadLetterQueueName } = await import('@/infrastructure/queue/dlq/dead-letter.js');
      expect(getDeadLetterQueueName('mail')).toBe('mail-dlq');
    });
  });

  // P0-#6 regression: no worker consumes a `*-dlq` mirror, so its snapshots sit in `waiting` and
  // BullMQ's removeOnComplete / removeOnFail never fire for them — the queue-level defaults that
  // used to stand in for a bound bounded nothing. The real bounds: a size cap checked on every
  // write, and an age trim run on every DLQ-depth tick.
  describe('DLQ retention bounds (P0-#6)', () => {
    const terminalJob = {
      id: 'job-retention',
      name: 'dispatch-test',
      data: {},
      attemptsMade: 3,
      opts: { attempts: 3 },
    } as Job;

    it('keeps the mirror bounds within reason: 30 days and at most 10,000 snapshots per mirror', async () => {
      const { DEAD_LETTER_MIRROR_MAX_JOBS, DEAD_LETTER_MIRROR_RETENTION_MS } = await import(
        '@/infrastructure/queue/dlq/dead-letter.js'
      );
      const { THIRTY_DAYS_SECONDS } = await import('@/shared/constants/ttl.constants.js');
      expect(DEAD_LETTER_MIRROR_RETENTION_MS).toBe(THIRTY_DAYS_SECONDS * 1_000);
      expect(DEAD_LETTER_MIRROR_MAX_JOBS).toBeGreaterThan(0);
      expect(DEAD_LETTER_MIRROR_MAX_JOBS).toBeLessThanOrEqual(10_000);
    });

    it('mirrors a final failure while the mirror has room', async () => {
      const { enqueueDeadLetter, DEAD_LETTER_MIRROR_MAX_JOBS } = await import(
        '@/infrastructure/queue/dlq/dead-letter.js'
      );
      queueGetWaitingCountMock.mockResolvedValue(DEAD_LETTER_MIRROR_MAX_JOBS - 1);

      await enqueueDeadLetter('mail', terminalJob, new Error('boom'));

      expect(queueAddMock).toHaveBeenCalledOnce();
    });

    it('stops mirroring once the mirror is full, so a failure storm cannot fill Redis', async () => {
      const { enqueueDeadLetter, DEAD_LETTER_MIRROR_MAX_JOBS } = await import(
        '@/infrastructure/queue/dlq/dead-letter.js'
      );
      const { logger } = await import('@/shared/utils/infrastructure/logger.util.js');
      const warnSpy = vi.spyOn(logger, 'warn');
      queueGetWaitingCountMock.mockResolvedValue(DEAD_LETTER_MIRROR_MAX_JOBS);

      await enqueueDeadLetter('mail', terminalJob, new Error('boom'));

      expect(queueAddMock).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          deadLetterQueue: 'mail-dlq',
          mirroredCount: DEAD_LETTER_MIRROR_MAX_JOBS,
        }),
        'queue.dead_letter.mirror_full',
      );
    });

    it('trims every mirror of the snapshots older than the retention, oldest first, capped per pass', async () => {
      const {
        trimDeadLetterQueueMirrors,
        DEAD_LETTER_MIRROR_MAX_JOBS,
        DEAD_LETTER_MIRROR_RETENTION_MS,
      } = await import('@/infrastructure/queue/dlq/dead-letter.js');
      queueCleanMock.mockImplementation(async (queueName: string) =>
        queueName === 'mail-dlq' ? ['dlq-a', 'dlq-b'] : [],
      );

      const removed = await trimDeadLetterQueueMirrors({
        sourceQueueNames: ['mail', 'notification'],
      });

      expect(removed).toBe(2);
      expect(queueCleanMock).toHaveBeenCalledWith(
        'mail-dlq',
        DEAD_LETTER_MIRROR_RETENTION_MS,
        DEAD_LETTER_MIRROR_MAX_JOBS,
        'wait',
      );
      expect(queueCleanMock).toHaveBeenCalledWith(
        'notification-dlq',
        DEAD_LETTER_MIRROR_RETENTION_MS,
        DEAD_LETTER_MIRROR_MAX_JOBS,
        'wait',
      );
    });

    it('keeps trimming the other mirrors when one fails', async () => {
      const { trimDeadLetterQueueMirrors } = await import(
        '@/infrastructure/queue/dlq/dead-letter.js'
      );
      queueCleanMock.mockImplementation(async (queueName: string) => {
        if (queueName === 'mail-dlq') throw new Error('redis down');
        return ['dlq-c'];
      });

      await expect(
        trimDeadLetterQueueMirrors({ sourceQueueNames: ['mail', 'notification'] }),
      ).resolves.toBe(1);
    });

    it('audit-#W2: redacts URL/query-embedded secrets in failed_reason/error_stack before the Redis mirror', async () => {
      const { enqueueDeadLetter } = await import('@/infrastructure/queue/dlq/dead-letter.js');

      const secretUrl = 'https://api.example.com/hook?api_key=live_sk_supersecret&id=42';
      const error = new Error(`outbound POST failed for ${secretUrl}`);
      error.stack = `Error: outbound POST failed for ${secretUrl}\n    at foo (bar.ts:1:1)`;
      const job = {
        id: 'job-secret',
        name: 'dispatch-test',
        data: {},
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as Job;

      await enqueueDeadLetter('webhook-delivery', job, error);

      const addCall = queueAddMock.mock.calls.at(-1)!;
      const data = addCall[1] as { failed_reason: string; error_stack: string };
      expect(data.failed_reason).toContain('api_key=[REDACTED]');
      expect(data.failed_reason).not.toContain('live_sk_supersecret');
      expect(data.error_stack).toContain('api_key=[REDACTED]');
      expect(data.error_stack).not.toContain('live_sk_supersecret');
    });

    it('audit-retention queue is in the canonical scheduler list so the Postgres DLQ ledger is bounded', async () => {
      const { getScheduledJobs } = await import('@/infrastructure/queue/scheduler.js');
      const { AUDIT_RETENTION_QUEUE_NAME } = await import(
        '@/domains/audit/workers/audit-retention.constants.js'
      );

      const scheduled = getScheduledJobs().map((job) => job.queueName);
      expect(scheduled).toContain(AUDIT_RETENTION_QUEUE_NAME);
    });
  });

  describe('attachDeadLetterAndAlerting', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it('does not enqueue or alert on transient failure', async () => {
      const { attachDeadLetterAndAlerting } = await import(
        '@/infrastructure/queue/dlq/dead-letter.js'
      );
      const fakeWorker = new EventEmitter() as unknown as Worker;
      attachDeadLetterAndAlerting(fakeWorker, 'notification');

      const job = {
        id: 'job-1',
        name: 'dispatch-notification',
        data: { notificationPublicId: 'ntf_000000000000000000001' },
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      fakeWorker.emit('failed', job, new Error('transient'), 'active');

      await Promise.resolve();
      await Promise.resolve();

      expect(queueAddMock).not.toHaveBeenCalled();
      expect(insertDeadLetterJobMock).not.toHaveBeenCalled();
      expect(sentryCaptureExceptionMock).not.toHaveBeenCalled();
    });

    it('persists to Postgres, enqueues dead letter, and captures Sentry on final failure', async () => {
      const { attachDeadLetterAndAlerting } = await import(
        '@/infrastructure/queue/dlq/dead-letter.js'
      );
      const fakeWorker = new EventEmitter() as unknown as Worker;
      attachDeadLetterAndAlerting(fakeWorker, 'notification');

      const finalError = new Error('permanent');
      const job = {
        id: 'job-2',
        name: 'dispatch-notification',
        data: { notificationPublicId: 'ntf_000000000000000000002' },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as Job;

      fakeWorker.emit('failed', job, finalError, 'active');

      await vi.waitFor(() => {
        expect(insertDeadLetterJobMock).toHaveBeenCalledTimes(1);
        expect(queueAddMock).toHaveBeenCalledTimes(1);
      });

      expect(insertDeadLetterJobMock).toHaveBeenCalledWith(
        expect.objectContaining({
          source_queue: 'notification',
          dead_letter_queue: 'notification-dlq',
          job_id: 'job-2',
          job_name: 'dispatch-notification',
          failed_reason: 'permanent',
          attempts_made: 3,
          max_attempts: 3,
          payload_summary: { notification_public_id: 'ntf_000000000000000000002' },
        }),
      );
      expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(finalError);
    });

    it('still mirrors to Redis after a Postgres persist failure is captured to Sentry', async () => {
      const persistError = new Error('postgres-down');
      insertDeadLetterJobMock.mockRejectedValueOnce(persistError);

      const { attachDeadLetterAndAlerting } = await import(
        '@/infrastructure/queue/dlq/dead-letter.js'
      );
      const fakeWorker = new EventEmitter() as unknown as Worker;
      attachDeadLetterAndAlerting(fakeWorker, 'notification');

      const finalError = new Error('permanent');
      const job = {
        id: 'job-3',
        name: 'dispatch-notification',
        data: { notificationPublicId: 'ntf_000000000000000000003' },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as Job;

      fakeWorker.emit('failed', job, finalError, 'active');

      await vi.waitFor(() => {
        expect(queueAddMock).toHaveBeenCalledTimes(1);
      });

      // One Sentry capture for the persist failure, one for the final-failure alert.
      expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(persistError);
      expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(finalError);
    });
  });

  describe('attachDeadLetterAndAlerting — final failures that skip the retry budget', () => {
    async function emitFailure(options: { error: Error; attemptsMade: number }) {
      const { attachDeadLetterAndAlerting } = await import(
        '@/infrastructure/queue/dlq/dead-letter.js'
      );
      const fakeWorker = new EventEmitter() as unknown as Worker;
      attachDeadLetterAndAlerting(fakeWorker, 'webhook-delivery');
      const job = {
        id: 'wda_9z3rura5kqvcv8zggriym',
        name: 'deliver-webhook',
        data: { deliveryAttemptPublicId: 'wda_9z3rura5kqvcv8zggriym', dlqReplayAttempt: 2 },
        attemptsMade: options.attemptsMade,
        opts: { attempts: 8 },
      } as unknown as Job;
      fakeWorker.emit('failed', job, options.error, 'active');
      return job;
    }

    it('records and alerts an UnrecoverableError thrown on its first attempt', async () => {
      // A job that can never succeed (a missing row, an unreadable secret) used to be logged and
      // dropped: no ledger row, no alert, nothing for an operator to find.
      const { UnrecoverableError } = await import('bullmq');
      const error = new UnrecoverableError('webhook.delivery.signing_secret_unreadable');

      await emitFailure({ error, attemptsMade: 1 });

      await vi.waitFor(() => {
        expect(insertDeadLetterJobMock).toHaveBeenCalledTimes(1);
      });
      expect(insertDeadLetterJobMock).toHaveBeenCalledWith(
        expect.objectContaining({
          failed_reason: 'webhook.delivery.signing_secret_unreadable',
          // The failed job was the second replay of its lineage.
          replay_depth: 2,
        }),
      );
      expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(error);
    });

    it('alerts a poison payload without recording it twice — the guard already did', async () => {
      const { UnrecoverableError } = await import('bullmq');
      const { markDeadLetterRecorded } = await import('@/infrastructure/queue/dlq/dead-letter.js');
      const error = markDeadLetterRecorded(
        new UnrecoverableError('bullmq.invalid_job_payload:webhook-delivery:{}'),
      );

      await emitFailure({ error, attemptsMade: 1 });

      await vi.waitFor(() => {
        expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(error);
      });
      expect(insertDeadLetterJobMock).not.toHaveBeenCalled();
      expect(queueAddMock).not.toHaveBeenCalled();
    });

    it('records an expected final failure without a Sentry page', async () => {
      // A customer endpoint that never accepted the delivery: the job is dead and its owner sees
      // it on the attempt row, but nobody on call can act on it.
      const error = Object.assign(new Error('Webhook delivery failed with HTTP 500'), {
        expectedFinalFailure: true,
      });

      await emitFailure({ error, attemptsMade: 8 });

      await vi.waitFor(() => {
        expect(insertDeadLetterJobMock).toHaveBeenCalledTimes(1);
        expect(queueAddMock).toHaveBeenCalledTimes(1);
      });
      expect(sentryCaptureExceptionMock).not.toHaveBeenCalled();
    });

    it('retries an expected failure that still has attempts left', async () => {
      const error = Object.assign(new Error('Webhook delivery failed with HTTP 500'), {
        expectedFinalFailure: true,
      });

      await emitFailure({ error, attemptsMade: 3 });
      await Promise.resolve();
      await Promise.resolve();

      expect(insertDeadLetterJobMock).not.toHaveBeenCalled();
      expect(sentryCaptureExceptionMock).not.toHaveBeenCalled();
    });
  });

  // Regression: `audit.dead_letter_jobs` has CHECK (max_attempts >= 1). A cron job's terminal
  // failure used to be persisted with max_attempts = 0 (BullMQ's default), the insert violated the
  // constraint, and the durable ledger silently missed every scheduled-job dead-letter.
  describe('recordDeadLetterFailure ledger row', () => {
    it('never writes max_attempts below 1 for a job with attempts 0', async () => {
      const { recordDeadLetterFailure } = await import('@/infrastructure/queue/dlq/dead-letter.js');
      const job = {
        id: 'repeat:stripe-webhook-event-catchup:1',
        name: 'catchup-missing-stripe-webhook-events',
        data: {},
        attemptsMade: 1,
        opts: { attempts: 0 },
      } as unknown as Job;

      await recordDeadLetterFailure('stripe-webhook-event-catchup', job, new Error('boom'));

      expect(insertDeadLetterJobMock).toHaveBeenCalledTimes(1);
      const row = insertDeadLetterJobMock.mock.calls[0]?.[0] as {
        max_attempts: number;
        attempts_made: number;
      };
      expect(row.max_attempts).toBe(1);
      expect(row.attempts_made).toBe(1);
    });
  });
});
