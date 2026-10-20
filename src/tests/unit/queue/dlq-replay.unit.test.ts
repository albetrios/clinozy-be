import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Capture sourceQueue and deadLetterQueue interactions.
const { sourceQueueAddMock, dlqGetJobMock, dlqRemoveMock, queueOptionsByName } = vi.hoisted(() => ({
  sourceQueueAddMock: vi.fn().mockResolvedValue(undefined),
  dlqGetJobMock: vi.fn().mockResolvedValue(null),
  dlqRemoveMock: vi.fn().mockResolvedValue(undefined),
  queueOptionsByName: new Map<string, Record<string, unknown>>(),
}));

type DlqReplayModule = typeof import('@/infrastructure/queue/dlq/dlq-replay.util.js');
let autoReplayDeadLetterFromLedger: DlqReplayModule['autoReplayDeadLetterFromLedger'];
let replayDeadLetterJob: DlqReplayModule['replayDeadLetterJob'];

vi.mock('bullmq', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Queue: class MockQueue {
    add?: typeof sourceQueueAddMock;
    getJob?: typeof dlqGetJobMock;
    close = vi.fn().mockResolvedValue(undefined);

    constructor(name: string, options: Record<string, unknown>) {
      queueOptionsByName.set(name, options);
      // Distinguish source queue vs DLQ by name suffix so mocks don't cross-contaminate.
      if (name.endsWith('-dlq')) {
        this.getJob = dlqGetJobMock;
      } else {
        this.add = sourceQueueAddMock;
      }
    }
  },
}));

vi.mock('@/infrastructure/database/connection.js', () => {
  const handle = {
    insert: () => ({ values: vi.fn().mockResolvedValue(undefined) }),
    execute: vi.fn().mockResolvedValue(undefined),
  };
  return {
    database: {
      insert: () => ({ values: vi.fn().mockResolvedValue(undefined) }),
      // sec-r5-async-queue-1: the audit-write paths wrap in `withMaintenanceDatabaseContext` →
      // `database.transaction(...)`. Stub the transaction call to execute its callback against a
      // handle that exposes the same `insert(...).values(...)` shape.
      transaction: (callback: (h: typeof handle) => Promise<unknown>) => callback(handle),
    },
  };
});

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeAll(async () => {
  // One cold import for the file — per-test dynamic import flakes under parallel forks
  // (timeout → next test sees polluted vi.fn() call counts).
  const dlqReplay = await import('@/infrastructure/queue/dlq/dlq-replay.util.js');
  autoReplayDeadLetterFromLedger = dlqReplay.autoReplayDeadLetterFromLedger;
  replayDeadLetterJob = dlqReplay.replayDeadLetterJob;
}, 60_000);

const notificationLedgerRow = {
  id: 1,
  source_queue: 'notification',
  dead_letter_queue: 'notification-dlq',
  job_id: 'original-job-7',
  job_name: 'dispatch-notification',
  payload_summary: {
    notification_public_id: 'ntf_000000000000000000007',
    organization_public_id: 'org_xxxxx',
    user_public_id: 'usr_000000000000000000007',
  },
  attempts_made: 3,
  replay_depth: 1,
};

describe('autoReplayDeadLetterFromLedger', () => {
  beforeEach(() => {
    sourceQueueAddMock.mockReset().mockResolvedValue(undefined);
    dlqGetJobMock.mockReset().mockResolvedValue(null);
    dlqRemoveMock.mockReset().mockResolvedValue(undefined);
  });

  it('re-enqueues to the source queue WITHOUT re-using the original jobId', async () => {
    // BullMQ's addStandardJob Lua treats a re-add with the same jobId as a `duplicated` event when
    // the original failed job is still in Redis under removeOnFail — a silent no-op. App-layer
    // idempotency (Stripe ledger, webhook delivery claim, notification markers) is the dedup.
    await autoReplayDeadLetterFromLedger({ ledgerRow: notificationLedgerRow });

    expect(sourceQueueAddMock).toHaveBeenCalledTimes(1);
    const callArguments = sourceQueueAddMock.mock.calls[0];
    if (callArguments && callArguments.length >= 3) {
      const options = callArguments[2] as Record<string, unknown> | undefined;
      expect(options?.jobId).toBeUndefined();
    }
  });

  it("goes through the source queue's own producer, so its attempts and retention apply", async () => {
    // A bare Queue gave the replay one attempt, no backoff, and kept it in Redis forever.
    await autoReplayDeadLetterFromLedger({ ledgerRow: notificationLedgerRow });

    const sourceQueueOptions = queueOptionsByName.get('notification') as {
      defaultJobOptions?: { attempts?: number; removeOnFail?: unknown };
    };
    expect(sourceQueueOptions.defaultJobOptions?.attempts).toBe(3);
    expect(sourceQueueOptions.defaultJobOptions?.removeOnFail).toBeDefined();
  });

  it('enqueues the replay one level deeper in its lineage', async () => {
    await autoReplayDeadLetterFromLedger({ ledgerRow: notificationLedgerRow });

    const [jobName, payload] = sourceQueueAddMock.mock.calls[0]!;
    expect(jobName).toBe('dispatch-notification');
    expect(payload).toEqual({
      notificationPublicId: 'ntf_000000000000000000007',
      organizationPublicId: 'org_xxxxx',
      userPublicId: 'usr_000000000000000000007',
      replayFromDlq: true,
      dlqReplayAttempt: 2,
    });
  });

  it('looks up the DLQ Redis mirror by the attempt-suffixed identifier and removes it', async () => {
    // The DLQ Redis jobId embeds attempts_made so a re-failure produces a fresh snapshot rather
    // than colliding with the prior failure. The ledger row carries the same `attempts_made`.
    dlqGetJobMock.mockResolvedValueOnce({ remove: dlqRemoveMock });

    await autoReplayDeadLetterFromLedger({ ledgerRow: notificationLedgerRow });

    expect(dlqGetJobMock).toHaveBeenCalledWith('dlq-notification-original-job-7-attempt-3');
    expect(dlqRemoveMock).toHaveBeenCalledOnce();
  });

  it('still reports the replay once it is enqueued when the mirror removal fails', async () => {
    // Rethrown, a follow-up failure left the ledger row unresolved and the sweeper replayed the
    // same failure again on every tick.
    dlqGetJobMock.mockRejectedValueOnce(new Error('redis blip'));

    const result = await autoReplayDeadLetterFromLedger({ ledgerRow: notificationLedgerRow });

    expect(sourceQueueAddMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 'replayed', originalQueue: 'notification' });
  });

  it('propagates a failed enqueue, so the sweeper retries the row', async () => {
    sourceQueueAddMock.mockRejectedValueOnce(new Error('redis down'));

    await expect(
      autoReplayDeadLetterFromLedger({ ledgerRow: notificationLedgerRow }),
    ).rejects.toThrow('redis down');
  });

  it('reports a mail row as not reconstructable and enqueues nothing', async () => {
    const result = await autoReplayDeadLetterFromLedger({
      ledgerRow: {
        ...notificationLedgerRow,
        source_queue: 'mail',
        dead_letter_queue: 'mail-dlq',
        job_name: 'send-email',
        payload_summary: { mail_outbox_token: '6b1d2e8f-3c4a-4b5d-8e9f-0a1b2c3d4e5f' }, // gitleaks:allow
      },
    });

    expect(result).toEqual({ status: 'payload_not_reconstructable' });
    expect(sourceQueueAddMock).not.toHaveBeenCalled();
  });
});

describe('replayDeadLetterJob — operator path', () => {
  beforeEach(() => {
    sourceQueueAddMock.mockReset().mockResolvedValue(undefined);
    dlqGetJobMock.mockReset();
    dlqRemoveMock.mockReset().mockResolvedValue(undefined);
  });

  it('reads the DLQ through the prefixed client and rebuilds the payload one level deeper', async () => {
    const dlqJobMock = {
      data: {
        original_queue: 'notification',
        original_job_id: 'original-job-7',
        original_job_name: 'dispatch-notification',
        original_data_summary: notificationLedgerRow.payload_summary,
        failed_reason: 'permanent',
        attempts_made: 3,
        max_attempts: 3,
        failed_at: new Date().toISOString(),
        replay_depth: 0,
      },
      remove: dlqRemoveMock,
    };
    dlqGetJobMock.mockResolvedValueOnce(dlqJobMock);

    const result = await replayDeadLetterJob({
      deadLetterQueueName: 'notification-dlq',
      deadLetterJobId: 'dlq-notification-original-job-7-attempt-3',
      dryRun: true,
      actorUserPublicId: 'user_xxxxx',
    });

    expect(result).toEqual({ status: 'replayed', originalQueue: 'notification' });
    expect(dlqGetJobMock).toHaveBeenCalledWith('dlq-notification-original-job-7-attempt-3');
    // The DLQ client carries the environment's key prefix — a bare Queue read an empty namespace.
    expect(queueOptionsByName.get('notification-dlq')).toMatchObject({
      prefix: expect.any(String),
    });
    // Dry run: nothing re-enqueued, nothing removed.
    expect(sourceQueueAddMock).not.toHaveBeenCalled();
    expect(dlqRemoveMock).not.toHaveBeenCalled();
  });
});
