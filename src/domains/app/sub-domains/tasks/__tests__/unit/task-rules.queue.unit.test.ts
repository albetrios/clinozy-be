import { beforeEach, describe, expect, it, vi } from 'vitest';

const addMock = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => ({
  Queue: class {
    add = addMock;
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('@/infrastructure/queue/connection.js', () => ({
  getBullMQKeyPrefix: () => 'test:bull',
  getBullMQProducerConnectionOptions: () => ({}),
}));

vi.mock('@/infrastructure/observability/tracing/trace-context.util.js', () => ({
  captureTraceContextForPropagation: () => ({}),
}));

import {
  enqueueTaskRules,
  requestTaskRulesRun,
} from '@/domains/app/sub-domains/tasks/queues/task-rules.queue.js';

/**
 * The task rules job's identity (TK4, D81 T7): one waiting job per organization and one more while
 * it runs — a message or a booking's status committed during a run must not wait for the sweep.
 */
describe('task rules queue', () => {
  beforeEach(() => {
    addMock.mockReset();
    addMock.mockResolvedValue(undefined);
  });

  it('keys each add to its organization and keeps the latest one while a run is active', async () => {
    await enqueueTaskRules('org_abc');
    const [jobName, jobData, options] = addMock.mock.calls[0]! as [
      string,
      Record<string, unknown>,
      { jobId: string; deduplication: unknown },
    ];
    expect(jobName).toBe('run-task-rules');
    expect(jobData).toMatchObject({ organizationPublicId: 'org_abc' });
    expect(options.deduplication).toEqual({ id: 'task-rules-org_abc', keepLastIfActive: true });
    expect(options.jobId).toMatch(/^task-rules-org_abc-/);
  });

  it('gives every add a unique jobId, so a retained finished job never swallows a later one', async () => {
    await enqueueTaskRules('org_abc');
    await enqueueTaskRules('org_abc');
    const jobIds = addMock.mock.calls.map((call) => (call[2] as { jobId: string }).jobId);
    expect(new Set(jobIds).size).toBe(2);
  });

  it('a request never fails its write — a Redis refusal is logged, not thrown', async () => {
    addMock.mockRejectedValueOnce(new Error('Redis is down'));
    await expect(requestTaskRulesRun('org_abc')).resolves.toBeUndefined();
  });
});
