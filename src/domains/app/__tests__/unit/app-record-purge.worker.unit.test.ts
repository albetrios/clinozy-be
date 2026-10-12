import { beforeEach, describe, expect, it, vi } from 'vitest';

const workerState = vi.hoisted(() => ({
  queueName: undefined as string | undefined,
  processor: undefined as (() => Promise<unknown>) | undefined,
  options: undefined as Record<string, unknown> | undefined,
  on: {} as Record<string, (...args: unknown[]) => void>,
}));

const mocks = vi.hoisted(() => ({
  withMaintenanceDatabaseContext: vi.fn(),
  runAppRecordPurgeJob: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function WorkerMock(queueName, processor, options) {
    workerState.queueName = queueName;
    workerState.processor = processor;
    workerState.options = options;
    return {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        workerState.on[event] = handler;
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
  getRetentionWorkerOptions: () => ({ lockDuration: 120_000 }),
  RETENTION_WORKER_CONCURRENCY: 1,
}));

vi.mock('@/infrastructure/queue/worker-runtime/worker-close.util.js', () => ({
  buildWorkerHandle: ({ worker, queueName }: { worker: unknown; queueName: string }) => ({
    worker,
    queueName,
    close: async () => undefined,
  }),
}));

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  withMaintenanceDatabaseContext: mocks.withMaintenanceDatabaseContext,
}));

vi.mock('@/domains/app/workers/app-record-purge.processor.js', () => ({
  runAppRecordPurgeJob: mocks.runAppRecordPurgeJob,
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * The app records' purge worker: the nightly job runs under the global retention bypass (it purges
 * every organization's long-deleted records), on its queue with the retention options.
 */
describe('app-record-purge worker', () => {
  beforeEach(() => {
    workerState.on = {};
    mocks.withMaintenanceDatabaseContext.mockReset();
    mocks.runAppRecordPurgeJob.mockReset();
    mocks.withMaintenanceDatabaseContext.mockImplementation(
      async ({ callback }: { callback: (handle: unknown) => Promise<unknown> }) =>
        callback({ kind: 'global-retention' }),
    );
  });

  it('purges inside the global retention context', async () => {
    const { MAINTENANCE_SCOPE } = await import(
      '@/infrastructure/database/contexts/database-context.js'
    );
    const { createAppRecordPurgeWorker } = await import(
      '@/domains/app/workers/app-record-purge.worker.js'
    );
    mocks.runAppRecordPurgeJob.mockResolvedValue({ purged: 4 });

    const handle = createAppRecordPurgeWorker();

    expect(handle.queueName).toBe('app-record-purge');
    expect(workerState.options).toEqual(
      expect.objectContaining({ concurrency: 1, prefix: 'test:bull' }),
    );
    await expect(workerState.processor?.()).resolves.toEqual({ purged: 4 });
    expect(mocks.withMaintenanceDatabaseContext).toHaveBeenCalledWith(
      expect.objectContaining({ scope: MAINTENANCE_SCOPE.GLOBAL_RETENTION_CLEANUP }),
    );
    expect(mocks.runAppRecordPurgeJob).toHaveBeenCalledWith({ kind: 'global-retention' });
  });

  it('lets a failed purge reach BullMQ’s retry, and logs a stalled run', async () => {
    const { logger } = await import('@/shared/utils/infrastructure/logger.util.js');
    const { createAppRecordPurgeWorker } = await import(
      '@/domains/app/workers/app-record-purge.worker.js'
    );
    mocks.runAppRecordPurgeJob.mockRejectedValue(new Error('database down'));

    createAppRecordPurgeWorker();

    await expect(workerState.processor?.()).rejects.toThrow('database down');
    workerState.on.stalled?.('job-9');
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      { jobId: 'job-9', queue: 'app-record-purge' },
      'app-record-purge.stalled',
    );
  });
});
