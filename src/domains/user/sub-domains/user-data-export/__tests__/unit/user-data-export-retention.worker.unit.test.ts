import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Worker-level suite for the `user-data-export-retention` scheduled cleanup.
 *
 * The worker only schedules: the job opens its own short global-retention context per page
 * (asserted in the processor suite), so no transaction is held across the S3 deletes.
 */
const workerState = vi.hoisted(() => ({
  queueName: undefined as string | undefined,
  processor: undefined as (() => Promise<unknown>) | undefined,
  options: undefined as Record<string, unknown> | undefined,
  onHandlers: {} as Record<string, (...args: unknown[]) => void>,
}));

const runUserDataExportRetentionJobMock = vi.fn();

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function WorkerMock(queueName, processor, options) {
    workerState.queueName = queueName;
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

vi.mock('@/infrastructure/queue/connection.js', () => ({
  getBullMQKeyPrefix: () => 'test:bull',
  getBullMQConnectionOptions: () => ({ host: 'redis.test' }),
}));

vi.mock('@/infrastructure/queue/worker-runtime/worker-options.js', () => ({
  getRetentionWorkerOptions: () => ({
    lockDuration: 120_000,
    stalledInterval: 30_000,
    maxStalledCount: 1,
  }),
  RETENTION_WORKER_CONCURRENCY: 1,
}));

vi.mock('@/infrastructure/queue/worker-runtime/worker-close.util.js', () => ({
  buildWorkerHandle: ({ worker, queueName }: { worker: unknown; queueName: string }) => ({
    worker,
    queueName,
    close: async () => undefined,
  }),
}));

vi.mock(
  '@/domains/user/sub-domains/user-data-export/workers/user-data-export-retention.processor.js',
  () => ({
    runUserDataExportRetentionJob: (...args: unknown[]) =>
      runUserDataExportRetentionJobMock(...args),
  }),
);

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

async function importWorkerFactory() {
  const module = await import(
    '@/domains/user/sub-domains/user-data-export/workers/user-data-export-retention.worker.js'
  );
  return module.createUserDataExportRetentionWorker;
}

describe('user-data-export-retention.worker', () => {
  beforeEach(() => {
    workerState.queueName = undefined;
    workerState.processor = undefined;
    workerState.options = undefined;
    workerState.onHandlers = {};
    runUserDataExportRetentionJobMock.mockReset();
    runUserDataExportRetentionJobMock.mockResolvedValue({ deletedCount: 3, objectsDeleted: 3 });
  });

  it('creates the BullMQ Worker on the user-data-export-retention queue', async () => {
    const createUserDataExportRetentionWorker = await importWorkerFactory();

    const handle = createUserDataExportRetentionWorker();

    expect(workerState.queueName).toBe('user-data-export-retention');
    expect(handle.queueName).toBe('user-data-export-retention');
    expect(handle.worker).toBeDefined();
  });

  it('runs at RETENTION_WORKER_CONCURRENCY with the retention worker options', async () => {
    const createUserDataExportRetentionWorker = await importWorkerFactory();

    createUserDataExportRetentionWorker();

    expect(workerState.options).toEqual(
      expect.objectContaining({ concurrency: 1, lockDuration: 120_000, maxStalledCount: 1 }),
    );
  });

  it('runs the retention job and returns its result', async () => {
    const createUserDataExportRetentionWorker = await importWorkerFactory();

    createUserDataExportRetentionWorker();
    const result = await workerState.processor?.();

    expect(runUserDataExportRetentionJobMock).toHaveBeenCalledWith();
    expect(result).toEqual({ deletedCount: 3, objectsDeleted: 3 });
  });

  it('logs a warning with queue name and jobId when a job stalls', async () => {
    const { logger } = await import('@/shared/utils/infrastructure/logger.util.js');
    const createUserDataExportRetentionWorker = await importWorkerFactory();

    createUserDataExportRetentionWorker();
    workerState.onHandlers.stalled?.('job-export-retention-001');

    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      { jobId: 'job-export-retention-001', queue: 'user-data-export-retention' },
      'user-data-export-retention.stalled',
    );
  });

  it('propagates a job failure so BullMQ can retry or dead-letter it', async () => {
    runUserDataExportRetentionJobMock.mockRejectedValue(new Error('export-retention-failed'));

    const createUserDataExportRetentionWorker = await importWorkerFactory();
    createUserDataExportRetentionWorker();

    await expect(workerState.processor?.()).rejects.toThrow('export-retention-failed');
  });
});
