import { beforeEach, describe, expect, it, vi } from 'vitest';

const workerState = vi.hoisted(() => ({
  processor: undefined as ((job: unknown) => Promise<unknown>) | undefined,
  options: undefined as Record<string, unknown> | undefined,
  onHandlers: {} as Record<string, (...args: unknown[]) => void>,
}));

const processMailOutboxJobMock = vi.fn();
const parseJobDataOrDeadLetterMock = vi.fn();
const runWithPropagatedTraceContextMock = vi.fn();

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function WorkerMock(_queueName, processor, options) {
    workerState.processor = processor;
    workerState.options = options;
    return {
      on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        workerState.onHandlers[event] = handler;
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

// The real factory adds the pause behaviour (its own suites cover it); here it only has to build
// the worker through the mocked BullMQ above and record which provider the queue pauses for.
const pausableWorkerState = vi.hoisted(() => ({
  provider: undefined as string | undefined,
  limiter: undefined as unknown,
}));
vi.mock('@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js', async () => {
  const { Worker } = await import('bullmq');
  return {
    createProviderPausableWorker: (options: {
      queueName: string;
      provider: string;
      processor: unknown;
      workerOptions: unknown;
      limiter?: unknown;
    }) => {
      pausableWorkerState.provider = options.provider;
      pausableWorkerState.limiter = options.limiter;
      return new (Worker as unknown as new (...arguments_: unknown[]) => unknown)(
        options.queueName,
        options.processor,
        options.workerOptions,
      );
    },
  };
});

vi.mock('@/infrastructure/queue/connection.js', () => ({
  getBullMQKeyPrefix: () => 'test:bull',
  getBullMQConnectionOptions: () => ({ host: 'redis.test' }),
}));

vi.mock('@/infrastructure/queue/worker-runtime/worker-options.js', () => ({
  getDefaultWorkerOptions: () => ({
    lockDuration: 30_000,
    stalledInterval: 30_000,
    maxStalledCount: 1,
  }),
}));

vi.mock('@/infrastructure/queue/worker-runtime/worker-close.util.js', () => ({
  buildWorkerHandle: ({ worker, queueName }: { worker: unknown; queueName: string }) => ({
    worker,
    queueName,
    close: async () => undefined,
  }),
}));

vi.mock('@/infrastructure/mail/workers/mail.processor.js', () => ({
  processMailOutboxJob: (...args: unknown[]) => processMailOutboxJobMock(...args),
}));

vi.mock('@/infrastructure/mail/queues/mail.queue.js', () => ({
  MAIL_QUEUE_NAME: 'mail',
  MAIL_QUEUE_MAX_ATTEMPTS: 8,
}));

vi.mock('@/infrastructure/mail/queues/mail-backoff.util.js', () => ({
  mailBackoffStrategy: vi.fn().mockReturnValue(5_000),
}));

vi.mock('@/infrastructure/mail/queues/mail.job.schema.js', () => ({
  mailJobDataSchema: {
    safeParse: vi.fn().mockReturnValue({ success: true, data: {} }),
  },
}));

vi.mock('@/infrastructure/queue/dlq/poison-job.util.js', () => ({
  parseJobDataOrDeadLetter: (...args: unknown[]) => parseJobDataOrDeadLetterMock(...args),
}));

vi.mock('@/infrastructure/observability/tracing/trace-context.util.js', () => ({
  runWithPropagatedTraceContext: ({
    carrier: _context,
    spanName: _name,
    callback: fn,
  }: {
    carrier: unknown;
    spanName: string;
    callback: () => Promise<unknown>;
  }) => runWithPropagatedTraceContextMock({ carrier: _context, spanName: _name, callback: fn }),
}));

vi.mock('@/shared/config/worker-concurrency.util.js', () => ({
  getWorkerConcurrencyMail: () => 3,
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/shared/utils/validation/omit-undefined.util.js', () => ({
  omitUndefined: (obj: Record<string, unknown>) => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  },
}));

describe('mail.worker', () => {
  const validJobData = {
    mailOutboxToken: '6b1d2e8f-3c4a-4b5d-8e9f-0a1b2c3d4e5f',
    requestId: 'req-test-1',
    traceparent: undefined,
    tracestate: undefined,
  };

  const mockJob = {
    id: 'job-mail-001',
    name: 'send-email',
    data: validJobData,
    attemptsMade: 0,
    opts: { attempts: 8 },
  };

  beforeEach(() => {
    workerState.processor = undefined;
    workerState.options = undefined;
    workerState.onHandlers = {};
    processMailOutboxJobMock.mockReset();
    parseJobDataOrDeadLetterMock.mockReset();
    runWithPropagatedTraceContextMock.mockReset();

    parseJobDataOrDeadLetterMock.mockResolvedValue(validJobData);
    runWithPropagatedTraceContextMock.mockImplementation(
      async ({
        carrier: _context,
        spanName: _name,
        callback: fn,
      }: {
        carrier: unknown;
        spanName: string;
        callback: () => Promise<unknown>;
      }) => fn(),
    );
    processMailOutboxJobMock.mockResolvedValue({ messageId: 'resend-msg-123' });
  });

  it('creates BullMQ Worker with the correct mail queue name', async () => {
    const { createMailWorker } = await import('@/infrastructure/mail/workers/mail.worker.js');

    const handle = createMailWorker();

    expect(handle.queueName).toBe('mail');
    // While Resend is down the queue pauses instead of spending attempts.
    expect(pausableWorkerState.provider).toBe('resend');
    // Sends are paced to Resend's per-team rate across every replica (default 10 a second).
    expect(pausableWorkerState.limiter).toEqual({ max: 10, duration: 1_000 });
  });

  it('creates worker with mail concurrency from getWorkerConcurrencyMail', async () => {
    const { createMailWorker } = await import('@/infrastructure/mail/workers/mail.worker.js');

    createMailWorker();

    expect(workerState.options).toEqual(expect.objectContaining({ concurrency: 3 }));
  });

  it('processor parses job data and delegates to processMailOutboxJob', async () => {
    const { createMailWorker } = await import('@/infrastructure/mail/workers/mail.worker.js');

    createMailWorker();
    const result = await workerState.processor?.(mockJob);

    expect(parseJobDataOrDeadLetterMock).toHaveBeenCalledWith(
      expect.objectContaining({ job: mockJob, queueName: 'mail' }),
    );
    expect(processMailOutboxJobMock).toHaveBeenCalledOnce();
    expect(result).toEqual({ messageId: 'resend-msg-123' });
  });

  it('processor wraps job execution in runWithPropagatedTraceContext', async () => {
    const { createMailWorker } = await import('@/infrastructure/mail/workers/mail.worker.js');

    createMailWorker();
    await workerState.processor?.(mockJob);

    expect(runWithPropagatedTraceContextMock).toHaveBeenCalledOnce();
  });

  it('stalled handler logs a warning with queue name and jobId', async () => {
    const { logger } = await import('@/shared/utils/infrastructure/logger.util.js');
    const { createMailWorker } = await import('@/infrastructure/mail/workers/mail.worker.js');

    createMailWorker();
    workerState.onHandlers.stalled?.('job-mail-stalled');

    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      { jobId: 'job-mail-stalled', queue: 'mail' },
      'mail.worker.stalled',
    );
  });

  it('completed handler logs info with job id', async () => {
    const { logger } = await import('@/shared/utils/infrastructure/logger.util.js');
    const { createMailWorker } = await import('@/infrastructure/mail/workers/mail.worker.js');

    createMailWorker();
    workerState.onHandlers.completed?.({ id: 'job-mail-done' });

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      { jobId: 'job-mail-done' },
      'mail.worker.completed',
    );
  });

  it('buildWorkerHandle is called with worker and queue name', async () => {
    const { createMailWorker } = await import('@/infrastructure/mail/workers/mail.worker.js');

    const handle = createMailWorker();

    expect(handle.worker).toBeDefined();
    expect(handle.queueName).toBe('mail');
  });

  it('processor throws when parseJobDataOrDeadLetter throws — error propagates out', async () => {
    parseJobDataOrDeadLetterMock.mockRejectedValue(new Error('poison-payload'));

    const { createMailWorker } = await import('@/infrastructure/mail/workers/mail.worker.js');

    createMailWorker();

    await expect(workerState.processor?.(mockJob)).rejects.toThrow('poison-payload');
  });

  it('processor throws when processMailOutboxJob throws — error propagates out', async () => {
    processMailOutboxJobMock.mockRejectedValue(new Error('send-failed'));

    const { createMailWorker } = await import('@/infrastructure/mail/workers/mail.worker.js');

    createMailWorker();

    await expect(workerState.processor?.(mockJob)).rejects.toThrow('send-failed');
  });
});
