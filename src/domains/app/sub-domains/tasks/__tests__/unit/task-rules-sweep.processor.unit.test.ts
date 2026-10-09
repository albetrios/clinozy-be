import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findOrganizationsForTaskRules: vi.fn(),
  enqueueTaskRules: vi.fn(),
}));

vi.mock('@/infrastructure/queue/worker-runtime/worker-processor.util.js', () => ({
  runGlobalRetentionWorkerJob: (work: (handle: unknown) => unknown) => work({ kind: 'retention' }),
}));
vi.mock('@/domains/app/sub-domains/tasks/task-rules.repository.js', () => ({
  findOrganizationsForTaskRules: mocks.findOrganizationsForTaskRules,
}));
vi.mock('@/domains/app/sub-domains/tasks/queues/task-rules.queue.js', () => ({
  enqueueTaskRules: mocks.enqueueTaskRules,
}));
vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runTaskRulesSweepJob } from '@/domains/app/sub-domains/tasks/workers/task-rules-sweep.processor.js';
import { TASK_RULES_SWEEP_BATCH } from '@/domains/app/sub-domains/tasks/workers/task-rules.constants.js';

/** `count` organizations with ids from `firstId`. */
function organizations(firstId: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: firstId + index,
    publicId: `org_${String(firstId + index).padStart(21, 'a')}`,
  }));
}

/** The task rules sweep (TK4, D74): one job per active team organization, page by page. */
describe('runTaskRulesSweepJob', () => {
  beforeEach(() => {
    mocks.findOrganizationsForTaskRules.mockReset();
    mocks.enqueueTaskRules.mockReset().mockResolvedValue(undefined);
  });

  it('pages through every organization in id order and adds each one job', async () => {
    const first = organizations(1, TASK_RULES_SWEEP_BATCH);
    mocks.findOrganizationsForTaskRules
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(organizations(TASK_RULES_SWEEP_BATCH + 1, 2));

    expect(await runTaskRulesSweepJob()).toEqual({
      enqueuedCount: TASK_RULES_SWEEP_BATCH + 2,
      failedCount: 0,
    });
    expect(mocks.findOrganizationsForTaskRules.mock.calls.map((call) => call[1])).toEqual([
      0,
      TASK_RULES_SWEEP_BATCH,
    ]);
  });

  it('skips an add Redis refuses — the next sweep adds it again', async () => {
    mocks.findOrganizationsForTaskRules.mockResolvedValueOnce(organizations(1, 3));
    mocks.enqueueTaskRules.mockRejectedValueOnce(new Error('redis down'));

    expect(await runTaskRulesSweepJob()).toEqual({ enqueuedCount: 2, failedCount: 1 });
  });

  it('a read error propagates so BullMQ retries the sweep', async () => {
    mocks.findOrganizationsForTaskRules.mockRejectedValueOnce(new Error('database down'));

    await expect(runTaskRulesSweepJob()).rejects.toThrow('database down');
  });
});
