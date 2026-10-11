import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Every worker the bootstrap starts carries its three runtime hooks. The heartbeat and job-duration
 * hooks once existed with no production caller: `/readyz` could never report a stalled worker and
 * `bullmq_job_duration_seconds` stayed empty, with nothing failing.
 */
const hooks = vi.hoisted(() => ({
  deadLetter: vi.fn(),
  jobMetrics: vi.fn(),
  heartbeat: vi.fn(),
}));

vi.mock('@/infrastructure/queue/dlq/dead-letter.js', () => ({
  attachDeadLetterAndAlerting: hooks.deadLetter,
  closeDeadLetterQueues: vi.fn(),
}));
vi.mock('@/infrastructure/observability/metrics/bullmq-metrics.js', () => ({
  attachBullMQJobMetrics: hooks.jobMetrics,
}));
vi.mock('@/infrastructure/queue/worker-runtime/worker-queue-heartbeat.js', () => ({
  attachWorkerQueueHeartbeat: hooks.heartbeat,
}));
vi.mock('@/infrastructure/database/contexts/database-context-runtime.js', () => ({
  isWorkerRuntime: () => true,
}));
vi.mock('@/infrastructure/queue/scheduler.js', () => ({
  registerScheduledJobs: async () => ({ close: async () => undefined }),
}));
vi.mock('@/infrastructure/queue/worker-runtime/scheduler-registry-audit.js', () => ({
  auditSchedulerRegistryConsistency: vi.fn(),
}));
vi.mock('@/infrastructure/queue/worker-runtime/worker-connection-budget.js', () => ({
  computeWorkerPostgresPoolDemand: () => ({
    peakPostgresConcurrency: 0,
    peakPostgresConcurrencyHoldingExternalIo: 0,
    queues: [],
  }),
  resolveActiveWorkerQueueNames: () => ['test-queue-one', 'test-queue-two'],
}));
vi.mock('@/infrastructure/queue/worker-runtime/worker-queue-family.util.js', () => ({
  getSelectedWorkerQueueFamilies: () => ['mail'],
}));
vi.mock('@/shared/utils/infrastructure/process-memory-monitor.util.js', () => ({
  startProcessMemoryMonitoring: vi.fn(),
  stopProcessMemoryMonitoring: vi.fn(),
}));
vi.mock('@/infrastructure/queue/worker-runtime/worker-registration.registry.js', () => ({
  getWorkerRegistrationsForFamilies: () =>
    ['test-queue-one', 'test-queue-two'].map((queueName) => ({
      queueName,
      logLabel: queueName,
      create: () => ({ worker: { name: queueName }, queueName, close: async () => undefined }),
    })),
}));

describe('registerDomainWorkers', () => {
  beforeEach(() => {
    for (const hook of Object.values(hooks)) hook.mockReset();
  });

  it('attaches the dead-letter, job-duration and heartbeat hooks to every worker it starts', async () => {
    const { registerDomainWorkers } = await import('@/infrastructure/queue/bootstrap.js');

    const handles = await registerDomainWorkers({} as never);

    // The scheduler handle plus the two workers.
    expect(handles).toHaveLength(3);
    for (const queueName of ['test-queue-one', 'test-queue-two']) {
      const worker = { name: queueName };
      expect(hooks.deadLetter).toHaveBeenCalledWith({ worker, queueName });
      expect(hooks.jobMetrics).toHaveBeenCalledWith({ worker, queueName });
      expect(hooks.heartbeat).toHaveBeenCalledWith({ worker, queueName });
    }
  });
});
