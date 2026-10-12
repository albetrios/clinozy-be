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
  runTaskRulesJob: vi.fn(),
  runTaskRulesSweepJob: vi.fn(),
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

vi.mock('@/domains/app/sub-domains/tasks/workers/task-rules.processor.js', () => ({
  runTaskRulesJob: mocks.runTaskRulesJob,
}));

vi.mock('@/domains/app/sub-domains/tasks/workers/task-rules-sweep.processor.js', () => ({
  runTaskRulesSweepJob: mocks.runTaskRulesSweepJob,
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * The task rules workers' wiring (TK10, D78): each runs on its queue with the retention options;
 * the per-organization job validates its payload (a malformed one is dead-lettered) and runs the
 * rules inside that organization's context; the five-minute sweep only adds jobs.
 */
describe('task rules workers', () => {
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

  it('runs one organization’s rules inside its context, after validating the payload', async () => {
    const { createTaskRulesWorker } = await import(
      '@/domains/app/sub-domains/tasks/workers/task-rules.worker.js'
    );
    const { taskRulesJobDataSchema } = await import(
      '@/domains/app/sub-domains/tasks/queues/task-rules.job.schema.js'
    );
    mocks.runTaskRulesJob.mockResolvedValue({ opened: 2 });

    const handle = createTaskRulesWorker();
    const [worker] = workerState.created;
    const job = { name: 'task-rules', data: { organizationPublicId: 'org_a' } };

    expect(handle.queueName).toBe('task-rules');
    expect(worker?.queueName).toBe('task-rules');
    expect(worker?.options).toEqual(
      expect.objectContaining({ concurrency: 1, prefix: 'test:bull', lockDuration: 120_000 }),
    );
    await expect(worker?.processor(job)).resolves.toEqual({ opened: 2 });
    expect(mocks.parseJobDataOrDeadLetter).toHaveBeenCalledWith({
      schema: taskRulesJobDataSchema,
      job,
      queueName: 'task-rules',
    });
    expect(mocks.runOrganizationScopedWorkerJob).toHaveBeenCalledWith(
      expect.objectContaining({ job: { organizationPublicId: 'org_a' } }),
    );
    expect(mocks.runTaskRulesJob).toHaveBeenCalledWith({
      databaseHandle: { kind: 'organization-handle' },
      organizationPublicId: 'org_a',
    });
  });

  it('never opens a context for a payload the dead letter took', async () => {
    const { createTaskRulesWorker } = await import(
      '@/domains/app/sub-domains/tasks/workers/task-rules.worker.js'
    );
    mocks.parseJobDataOrDeadLetter.mockRejectedValue(new Error('bullmq.invalid_job_payload'));

    createTaskRulesWorker();

    await expect(
      workerState.created[0]?.processor({ name: 'task-rules', data: {} }),
    ).rejects.toThrow('bullmq.invalid_job_payload');
    expect(mocks.runOrganizationScopedWorkerJob).not.toHaveBeenCalled();
  });

  it('lets a failed run reach BullMQ’s retry', async () => {
    const { createTaskRulesWorker } = await import(
      '@/domains/app/sub-domains/tasks/workers/task-rules.worker.js'
    );
    mocks.runTaskRulesJob.mockRejectedValue(new Error('database down'));

    createTaskRulesWorker();

    await expect(
      workerState.created[0]?.processor({
        name: 'task-rules',
        data: { organizationPublicId: 'org_a' },
      }),
    ).rejects.toThrow('database down');
  });

  it('the sweep adds the jobs and logs a stalled run', async () => {
    const { logger } = await import('@/shared/utils/infrastructure/logger.util.js');
    const { createTaskRulesSweepWorker } = await import(
      '@/domains/app/sub-domains/tasks/workers/task-rules-sweep.worker.js'
    );
    mocks.runTaskRulesSweepJob.mockResolvedValue({ enqueued: 3 });

    const handle = createTaskRulesSweepWorker();
    const [worker] = workerState.created;

    expect(handle.queueName).toBe('task-rules-sweep');
    expect(worker?.options).toEqual(expect.objectContaining({ concurrency: 1 }));
    await expect(worker?.processor()).resolves.toEqual({ enqueued: 3 });
    worker?.on.stalled?.('job-1');
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      { jobId: 'job-1', queue: 'task-rules-sweep' },
      'task-rules-sweep.stalled',
    );
  });
});
