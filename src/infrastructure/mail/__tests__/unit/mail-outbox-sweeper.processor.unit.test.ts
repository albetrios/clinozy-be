import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runMailOutboxSweeperJob } from '@/infrastructure/mail/workers/mail-outbox-sweeper.processor.js';

const STALE_PENDING_TOKEN = '0b6d3f2a-1c4e-4a5b-8d7c-9e0f1a2b3c4d';
const OTHER_STALE_PENDING_TOKEN = '1c7e4a3b-2d5f-4b6c-9e8d-0f1a2b3c4d5e';
const STUCK_SENDING_TOKEN = '2d8f5b4c-3e6a-4c7d-8f9e-1a2b3c4d5e6f';

const findStalePendingMailOutboxTokensMock = vi.fn();
const reclaimStaleSendingMailOutboxTokensMock = vi.fn();
const enqueueMailOutboxJobMock = vi.fn();
const resendCircuitGetStateMock = vi.fn();

vi.mock('@/infrastructure/resilience/circuit-breaker.js', () => ({
  resendCircuit: {
    getState: (...arguments_: unknown[]) => resendCircuitGetStateMock(...arguments_),
  },
}));

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    withMaintenanceDatabaseContext: vi.fn(
      async (_scope: unknown, callback: () => Promise<unknown>) => callback(),
    ),
  };
});

const deleteFinishedMailOutboxRowsCreatedBeforeMock = vi.fn().mockResolvedValue(0);

vi.mock('@/infrastructure/mail/mail-outbox.repository.js', () => ({
  findStalePendingMailOutboxTokens: (...arguments_: unknown[]) =>
    findStalePendingMailOutboxTokensMock(...arguments_),
  reclaimStaleSendingMailOutboxTokens: (...arguments_: unknown[]) =>
    reclaimStaleSendingMailOutboxTokensMock(...arguments_),
  deleteFinishedMailOutboxRowsCreatedBefore: (...arguments_: unknown[]) =>
    deleteFinishedMailOutboxRowsCreatedBeforeMock(...arguments_),
}));

vi.mock('@/infrastructure/mail/queues/mail.queue.js', () => ({
  enqueueMailOutboxJob: (...arguments_: unknown[]) => enqueueMailOutboxJobMock(...arguments_),
}));

vi.mock('@/shared/config/env.config.js', () => ({
  env: {
    MAIL_OUTBOX_SWEEP_PENDING_MINUTES: 5,
    MAIL_OUTBOX_RECLAIM_SENDING_MINUTES: 10,
    MAIL_OUTBOX_SWEEP_BATCH_SIZE: 50,
    LOG_LEVEL: 'silent',
  },
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('mail-outbox-sweeper.processor', () => {
  beforeEach(() => {
    findStalePendingMailOutboxTokensMock.mockReset();
    reclaimStaleSendingMailOutboxTokensMock.mockReset();
    enqueueMailOutboxJobMock.mockReset();
    reclaimStaleSendingMailOutboxTokensMock.mockResolvedValue([]);
    findStalePendingMailOutboxTokensMock.mockResolvedValue([
      STALE_PENDING_TOKEN,
      OTHER_STALE_PENDING_TOKEN,
    ]);
    enqueueMailOutboxJobMock.mockResolvedValue(undefined);
    resendCircuitGetStateMock.mockReset();
    resendCircuitGetStateMock.mockResolvedValue('CLOSED');
  });

  it('runMailOutboxSweeperJob re-enqueues stale pending rows', async () => {
    const result = await runMailOutboxSweeperJob();

    expect(reclaimStaleSendingMailOutboxTokensMock).toHaveBeenCalledOnce();
    expect(findStalePendingMailOutboxTokensMock).toHaveBeenCalledOnce();
    expect(enqueueMailOutboxJobMock).toHaveBeenCalledTimes(2);
    expect(enqueueMailOutboxJobMock).toHaveBeenCalledWith(STALE_PENDING_TOKEN, {
      requestId: 'mail-outbox-sweeper',
    });
    expect(result).toEqual({
      scannedCount: 2,
      reclaimedSendingCount: 0,
      reEnqueuedCount: 2,
      prunedCount: 0,
    });
  });

  it('runMailOutboxSweeperJob reclaims stuck sending rows before stale pending', async () => {
    reclaimStaleSendingMailOutboxTokensMock.mockResolvedValue([STUCK_SENDING_TOKEN]);
    findStalePendingMailOutboxTokensMock.mockResolvedValue([STALE_PENDING_TOKEN]);

    const result = await runMailOutboxSweeperJob();

    expect(findStalePendingMailOutboxTokensMock).toHaveBeenCalledWith(expect.any(Date), 49);
    expect(enqueueMailOutboxJobMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      scannedCount: 2,
      reclaimedSendingCount: 1,
      reEnqueuedCount: 2,
      prunedCount: 0,
    });
  });

  it('widens the sending-reclaim window when the Resend circuit is OPEN', async () => {
    resendCircuitGetStateMock.mockResolvedValue('OPEN');
    const before = Date.now();

    await runMailOutboxSweeperJob();

    const sendingCutoff = reclaimStaleSendingMailOutboxTokensMock.mock.calls[0]?.[0] as Date;
    // CLOSED would put the cutoff ~10 min in the past; OPEN doubles the window to ~20 min, so far
    // fewer rows qualify for reclaim while Resend is down.
    const cutoffAgeMinutes = (before - sendingCutoff.getTime()) / 60_000;
    expect(cutoffAgeMinutes).toBeGreaterThanOrEqual(19);
  });

  it('keeps the normal reclaim window when the Resend circuit is CLOSED', async () => {
    resendCircuitGetStateMock.mockResolvedValue('CLOSED');
    const before = Date.now();

    await runMailOutboxSweeperJob();

    const sendingCutoff = reclaimStaleSendingMailOutboxTokensMock.mock.calls[0]?.[0] as Date;
    const cutoffAgeMinutes = (before - sendingCutoff.getTime()) / 60_000;
    expect(cutoffAgeMinutes).toBeGreaterThanOrEqual(9);
    expect(cutoffAgeMinutes).toBeLessThan(15);
  });

  it('deletes finished rows past their retention window on every sweep', async () => {
    reclaimStaleSendingMailOutboxTokensMock.mockResolvedValue([]);
    findStalePendingMailOutboxTokensMock.mockResolvedValue([]);
    deleteFinishedMailOutboxRowsCreatedBeforeMock.mockResolvedValueOnce(7);

    const result = await runMailOutboxSweeperJob();

    const [olderThan, limit] = deleteFinishedMailOutboxRowsCreatedBeforeMock.mock.calls.at(-1) as [
      Date,
      number,
    ];
    // Thirty days back, bounded per pass.
    expect(Date.now() - olderThan.getTime()).toBeGreaterThanOrEqual(
      30 * 24 * 60 * 60 * 1000 - 1000,
    );
    expect(limit).toBe(1_000);
    expect(result.prunedCount).toBe(7);
  });
});
