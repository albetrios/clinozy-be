import { beforeEach, describe, expect, it, vi } from 'vitest';

const workerState = vi.hoisted(() => ({
  created: [] as {
    queueName: string;
    processor: (job?: unknown) => Promise<unknown>;
    options: Record<string, unknown>;
    on: Record<string, (...args: unknown[]) => void>;
  }[],
}));

const mocks = vi.hoisted(() => ({
  parseJobDataOrDeadLetter: vi.fn(),
  runOrganizationScopedWorkerJob: vi.fn(),
  runDayCloseAutoCloseJob: vi.fn(),
  runDayCloseAutoCloseSweepJob: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn(),
  UnrecoverableError: class UnrecoverableError extends Error {},
  Worker: vi.fn().mockImplementation(function WorkerMock(queueName, processor, options) {
    const on: Record<string, (...args: unknown[]) => void> = {};
    workerState.created.push({ queueName, processor, options, on });
    return {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        on[event] = handler;
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('@/infrastructure/queue/connection.js', () => ({
  getBullMQKeyPrefix: () => 'test:bull',
  getBullMQConnectionOptions: () => ({ host: 'redis.test' }),
}));

vi.mock('@/infrastructure/queue/worker-runtime/worker-options.js', () => ({
  getRetentionWorkerOptions: () => ({ lockDuration: 120_000, stalledInterval: 30_000 }),
  RETENTION_WORKER_CONCURRENCY: 1,
}));

vi.mock('@/infrastructure/queue/worker-runtime/worker-close.util.js', () => ({
  buildWorkerHandle: ({ worker, queueName }: { worker: unknown; queueName: string }) => ({
    worker,
    queueName,
    close: async () => undefined,
  }),
}));

vi.mock('@/infrastructure/queue/dlq/poison-job.util.js', () => ({
  parseJobDataOrDeadLetter: mocks.parseJobDataOrDeadLetter,
}));

vi.mock('@/infrastructure/queue/worker-runtime/worker-processor.util.js', () => ({
  runOrganizationScopedWorkerJob: mocks.runOrganizationScopedWorkerJob,
}));

vi.mock(
  '@/domains/app/sub-domains/billing/day-closes/workers/day-close-auto-close.processor.js',
  () => ({ runDayCloseAutoCloseJob: mocks.runDayCloseAutoCloseJob }),
);

vi.mock(
  '@/domains/app/sub-domains/billing/day-closes/workers/day-close-auto-close-sweep.processor.js',
  () => ({ runDayCloseAutoCloseSweepJob: mocks.runDayCloseAutoCloseSweepJob }),
);

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * The day-close workers' wiring (WC-39, B26): each runs on its queue with the retention options;
 * the per-organization job validates its payload (a malformed one is dead-lettered) and closes
 * the days inside that organization's context; the hourly sweep only adds jobs.
 */
describe('day-close auto-close workers', () => {
  beforeEach(() => {
    workerState.created = [];
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.parseJobDataOrDeadLetter.mockImplementation(
      async ({ job }: { job: { data: unknown } }) => job.data,
    );
    mocks.runOrganizationScopedWorkerJob.mockImplementation(
      async ({ processor }: { processor: (handle: unknown) => Promise<unknown> }) =>
        processor({ kind: 'organization-handle' }),
    );
  });

  it('runs one organization’s close inside its context, after validating the payload', async () => {
    const { createDayCloseAutoCloseWorker } = await import(
      '@/domains/app/sub-domains/billing/day-closes/workers/day-close-auto-close.worker.js'
    );
    const { dayCloseAutoCloseJobDataSchema } = await import(
      '@/domains/app/sub-domains/billing/day-closes/queues/day-close-auto-close.job.schema.js'
    );
    mocks.runDayCloseAutoCloseJob.mockResolvedValue({ closed: 2 });

    const handle = createDayCloseAutoCloseWorker();
    const [worker] = workerState.created;
    const job = { name: 'day-close-auto-close', data: { organizationPublicId: 'org_a' } };

    expect(handle.queueName).toBe('day-close-auto-close');
    expect(worker?.queueName).toBe('day-close-auto-close');
    expect(worker?.options).toEqual(
      expect.objectContaining({ concurrency: 1, prefix: 'test:bull', lockDuration: 120_000 }),
    );
    await expect(worker?.processor(job)).resolves.toEqual({ closed: 2 });
    expect(mocks.parseJobDataOrDeadLetter).toHaveBeenCalledWith({
      schema: dayCloseAutoCloseJobDataSchema,
      job,
      queueName: 'day-close-auto-close',
    });
    expect(mocks.runOrganizationScopedWorkerJob).toHaveBeenCalledWith(
      expect.objectContaining({ job: { organizationPublicId: 'org_a' } }),
    );
    expect(mocks.runDayCloseAutoCloseJob).toHaveBeenCalledWith({
      databaseHandle: { kind: 'organization-handle' },
      organizationPublicId: 'org_a',
    });
  });

  it('never opens a context for a payload the dead letter took', async () => {
    const { createDayCloseAutoCloseWorker } = await import(
      '@/domains/app/sub-domains/billing/day-closes/workers/day-close-auto-close.worker.js'
    );
    mocks.parseJobDataOrDeadLetter.mockRejectedValue(new Error('bullmq.invalid_job_payload'));

    createDayCloseAutoCloseWorker();

    await expect(
      workerState.created[0]?.processor({ name: 'day-close-auto-close', data: {} }),
    ).rejects.toThrow('bullmq.invalid_job_payload');
    expect(mocks.runOrganizationScopedWorkerJob).not.toHaveBeenCalled();
  });

  it('lets a failed close reach BullMQ’s retry', async () => {
    const { createDayCloseAutoCloseWorker } = await import(
      '@/domains/app/sub-domains/billing/day-closes/workers/day-close-auto-close.worker.js'
    );
    mocks.runDayCloseAutoCloseJob.mockRejectedValue(new Error('database down'));

    createDayCloseAutoCloseWorker();

    await expect(
      workerState.created[0]?.processor({
        name: 'day-close-auto-close',
        data: { organizationPublicId: 'org_a' },
      }),
    ).rejects.toThrow('database down');
  });

  it('the hourly sweep adds the jobs and logs a stalled run', async () => {
    const { logger } = await import('@/shared/utils/infrastructure/logger.util.js');
    const { createDayCloseAutoCloseSweepWorker } = await import(
      '@/domains/app/sub-domains/billing/day-closes/workers/day-close-auto-close-sweep.worker.js'
    );
    mocks.runDayCloseAutoCloseSweepJob.mockResolvedValue({ enqueued: 3 });

    const handle = createDayCloseAutoCloseSweepWorker();
    const [worker] = workerState.created;

    expect(handle.queueName).toBe('day-close-auto-close-sweep');
    expect(worker?.options).toEqual(expect.objectContaining({ concurrency: 1 }));
    await expect(worker?.processor()).resolves.toEqual({ enqueued: 3 });
    worker?.on.stalled?.('job-1');
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      { jobId: 'job-1', queue: 'day-close-auto-close-sweep' },
      'day-close-auto-close-sweep.stalled',
    );
  });
});
