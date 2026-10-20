import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CommitDispatchTask } from '@/infrastructure/queue/commit-dispatch/commit-dispatch.types.js';

const redisMock = {
  multi: vi.fn(),
  lrange: vi.fn(),
  lrem: vi.fn(),
  llen: vi.fn(),
  del: vi.fn(),
  zrem: vi.fn(),
  zrangebyscore: vi.fn(),
};

vi.mock('@/infrastructure/cache/redis.client.js', () => ({
  redisConnection: redisMock,
}));

function chainableMulti() {
  return {
    rpush: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    zrem: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };
}

describe('commit-dispatch.store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.multi.mockImplementation(chainableMulti);
    redisMock.lrem.mockResolvedValue(1);
    redisMock.llen.mockResolvedValue(0);
  });

  it('appendCommitDispatchTask writes to Redis list and recovery index', async () => {
    const { appendCommitDispatchTask } = await import(
      '@/infrastructure/queue/commit-dispatch/commit-dispatch.store.js'
    );
    const task: CommitDispatchTask = {
      type: 'mail_outbox',
      mailOutboxToken: '6b1d2e8f-3c4a-4b5d-8e9f-0a1b2c3d4e5f', // gitleaks:allow
    };

    await appendCommitDispatchTask({ requestId: 'req-1', task });

    const multi = redisMock.multi.mock.results[0]?.value;
    expect(multi.rpush).toHaveBeenCalledWith('commit-dispatch:pending:req-1', JSON.stringify(task));
    expect(multi.zadd).toHaveBeenCalledWith(
      'commit-dispatch:recovery',
      expect.any(Number),
      'req-1',
    );
  });

  it('reaudit-#2: consumeCommitDispatchTasks reads tasks WITHOUT removing them', async () => {
    const task: CommitDispatchTask = {
      type: 'notification',
      notificationPublicId: 'ntf_9z3rura5kqvcv8zggriym',
      organizationPublicId: 'org_abc',
      userPublicId: 'usr_0y8vf3ktxqnhcm1ze21ab',
    };
    const raw = JSON.stringify(task);
    redisMock.lrange.mockResolvedValue([raw]);

    const { consumeCommitDispatchTasks } = await import(
      '@/infrastructure/queue/commit-dispatch/commit-dispatch.store.js'
    );
    const tasks = await consumeCommitDispatchTasks({ requestId: 'req-2' });

    // Each task is returned with its raw form, and the durable list is NOT destroyed —
    // it survives until the caller acknowledges each task post-execution.
    expect(tasks).toEqual([{ task, raw }]);
    expect(redisMock.del).not.toHaveBeenCalled();
    expect(redisMock.lrem).not.toHaveBeenCalled();
  });

  it('reaudit-#2: acknowledgeCommitDispatchTask LREMs the task and clears the index once empty', async () => {
    const raw = JSON.stringify({
      type: 'mail_outbox',
      mailOutboxToken: '0d3c2b1a-9f8e-4d7c-8b6a-5f4e3d2c1b0a', // gitleaks:allow
    });
    redisMock.llen.mockResolvedValue(0); // list empty after this LREM

    const { acknowledgeCommitDispatchTask } = await import(
      '@/infrastructure/queue/commit-dispatch/commit-dispatch.store.js'
    );
    await acknowledgeCommitDispatchTask({ requestId: 'req-3', raw });

    expect(redisMock.lrem).toHaveBeenCalledWith('commit-dispatch:pending:req-3', 1, raw);
    const multi = redisMock.multi.mock.results.at(-1)?.value;
    expect(multi.del).toHaveBeenCalledWith('commit-dispatch:pending:req-3');
    expect(multi.zrem).toHaveBeenCalledWith('commit-dispatch:recovery', 'req-3');
  });

  it('reaudit-#2: acknowledge leaves the recovery index intact while tasks remain', async () => {
    const raw = JSON.stringify({
      type: 'mail_outbox',
      mailOutboxToken: '0d3c2b1a-9f8e-4d7c-8b6a-5f4e3d2c1b0a', // gitleaks:allow
    });
    redisMock.llen.mockResolvedValue(2); // more tasks still pending

    const { acknowledgeCommitDispatchTask } = await import(
      '@/infrastructure/queue/commit-dispatch/commit-dispatch.store.js'
    );
    await acknowledgeCommitDispatchTask({ requestId: 'req-4', raw });

    expect(redisMock.lrem).toHaveBeenCalledWith('commit-dispatch:pending:req-4', 1, raw);
    // The list is not yet empty, so the recovery index entry must remain (no del/zrem multi).
    expect(redisMock.multi).not.toHaveBeenCalled();
  });
});
