import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    withMaintenanceDatabaseContext: vi.fn(
      async (_scope: unknown, callback: () => Promise<unknown>) => callback(),
    ),
  };
});

const findDeadLetterJobsForAutoRetryMock = vi.fn();
const markDeadLetterJobAutoRetryResolvedMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/infrastructure/queue/dlq/dead-letter.repository.js', () => ({
  findDeadLetterJobsForAutoRetry: (...args: unknown[]) =>
    findDeadLetterJobsForAutoRetryMock(...args),
  markDeadLetterJobAutoRetryResolved: (...args: unknown[]) =>
    markDeadLetterJobAutoRetryResolvedMock(...args),
}));

const isDeadLetterSourceQueueCircuitClosedMock = vi.fn();
vi.mock('@/infrastructure/queue/dlq/dlq-auto-retry-circuit.util.js', () => ({
  isDeadLetterSourceQueueCircuitClosed: (...args: unknown[]) =>
    isDeadLetterSourceQueueCircuitClosedMock(...args),
}));

const autoReplayDeadLetterFromLedgerMock = vi.fn();
vi.mock('@/infrastructure/queue/dlq/dlq-replay.util.js', () => ({
  autoReplayDeadLetterFromLedger: (...args: unknown[]) =>
    autoReplayDeadLetterFromLedgerMock(...args),
  DLQ_REPLAY_SOURCE_QUEUE_NAMES: ['webhook-delivery', 'notification', 'stripe-webhook'],
}));

vi.mock('@/shared/config/env.config.js', () => ({
  env: {
    DLQ_AUTO_RETRY_ENABLED: true,
    DLQ_AUTO_RETRY_MAX_COUNT: 3,
    DLQ_AUTO_RETRY_BATCH_SIZE: 20,
    DLQ_AUTO_RETRY_COOLDOWN_MINUTES: 15,
  },
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runDlqAutoRetryJob } from '@/infrastructure/queue/dlq/dlq-auto-retry.processor.js';

function ledgerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    source_queue: 'notification',
    dead_letter_queue: 'notification-dlq',
    job_id: 'ntf_9z3rura5kqvcv8zggriym',
    job_name: 'dispatch-notification',
    payload_summary: {},
    attempts_made: 3,
    failed_at: new Date('2026-01-01T00:00:00.000Z'),
    replay_depth: 0,
    ...overrides,
  };
}

describe('runDlqAutoRetryJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findDeadLetterJobsForAutoRetryMock.mockResolvedValue([ledgerRow()]);
    markDeadLetterJobAutoRetryResolvedMock.mockResolvedValue(undefined);
    isDeadLetterSourceQueueCircuitClosedMock.mockResolvedValue(true);
    autoReplayDeadLetterFromLedgerMock.mockResolvedValue({
      status: 'replayed',
      originalQueue: 'notification',
    });
  });

  it('replays a waiting row once and marks it handled — it never replays again', async () => {
    const result = await runDlqAutoRetryJob();

    expect(autoReplayDeadLetterFromLedgerMock).toHaveBeenCalledExactlyOnceWith({
      ledgerRow: ledgerRow(),
    });
    expect(markDeadLetterJobAutoRetryResolvedMock).toHaveBeenCalledWith(7);
    expect(result).toMatchObject({ scannedCount: 1, replayedCount: 1 });
  });

  it('marks a row at the replay-depth limit handled without replaying it', async () => {
    findDeadLetterJobsForAutoRetryMock.mockResolvedValue([ledgerRow({ replay_depth: 3 })]);

    const result = await runDlqAutoRetryJob();

    expect(autoReplayDeadLetterFromLedgerMock).not.toHaveBeenCalled();
    expect(markDeadLetterJobAutoRetryResolvedMock).toHaveBeenCalledWith(7);
    expect(result.replayLimitCount).toBe(1);
  });

  it('replays a row one level below the limit', async () => {
    findDeadLetterJobsForAutoRetryMock.mockResolvedValue([ledgerRow({ replay_depth: 2 })]);

    const result = await runDlqAutoRetryJob();

    expect(autoReplayDeadLetterFromLedgerMock).toHaveBeenCalledOnce();
    expect(result.replayedCount).toBe(1);
  });

  it('marks a row whose payload cannot be rebuilt handled', async () => {
    autoReplayDeadLetterFromLedgerMock.mockResolvedValue({
      status: 'payload_not_reconstructable',
    });

    const result = await runDlqAutoRetryJob();

    expect(markDeadLetterJobAutoRetryResolvedMock).toHaveBeenCalledWith(7);
    expect(result.notReplayableCount).toBe(1);
  });

  it('leaves a row waiting for the next tick when its replay throws', async () => {
    autoReplayDeadLetterFromLedgerMock.mockRejectedValue(new Error('redis unavailable'));

    const result = await runDlqAutoRetryJob();

    expect(markDeadLetterJobAutoRetryResolvedMock).not.toHaveBeenCalled();
    expect(result.failedCount).toBe(1);
  });

  it('scans only the source queues whose circuit is closed, so a down provider cannot hold the head', async () => {
    isDeadLetterSourceQueueCircuitClosedMock.mockImplementation(
      async (sourceQueue: string) => sourceQueue !== 'stripe-webhook',
    );

    const result = await runDlqAutoRetryJob();

    expect(findDeadLetterJobsForAutoRetryMock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceQueues: ['webhook-delivery', 'notification'] }),
    );
    expect(result.circuitOpenQueueCount).toBe(1);
  });

  it('only scans rows older than the cooldown', async () => {
    const before = Date.now();

    await runDlqAutoRetryJob();

    const { failedBefore } = findDeadLetterJobsForAutoRetryMock.mock.calls[0]![0] as {
      failedBefore: Date;
    };
    expect(before - failedBefore.getTime()).toBeGreaterThanOrEqual(15 * 60_000 - 1_000);
  });
});
