import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findOrganizationsWithDaysToClose: vi.fn(),
  enqueueDayCloseAutoClose: vi.fn(),
}));

vi.mock('@/infrastructure/queue/worker-runtime/worker-processor.util.js', () => ({
  runGlobalRetentionWorkerJob: (work: (handle: unknown) => unknown) => work({ kind: 'retention' }),
}));
vi.mock('@/domains/app/sub-domains/billing/day-closes/day-close-auto-close.repository.js', () => ({
  findOrganizationsWithDaysToClose: mocks.findOrganizationsWithDaysToClose,
}));
vi.mock(
  '@/domains/app/sub-domains/billing/day-closes/queues/day-close-auto-close.queue.js',
  () => ({
    enqueueDayCloseAutoClose: mocks.enqueueDayCloseAutoClose,
  }),
);
vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runDayCloseAutoCloseSweepJob } from '@/domains/app/sub-domains/billing/day-closes/workers/day-close-auto-close-sweep.processor.js';

/** The hourly day auto-close sweep (WC-39, B26): one job per organization with a past day open. */
describe('runDayCloseAutoCloseSweepJob', () => {
  beforeEach(() => {
    mocks.findOrganizationsWithDaysToClose.mockReset();
    mocks.enqueueDayCloseAutoClose.mockReset().mockResolvedValue(undefined);
  });

  it('adds one job per organization the read finds', async () => {
    mocks.findOrganizationsWithDaysToClose.mockResolvedValueOnce([
      'org_aaaaaaaaaaaaaaaaaaaa1',
      'org_aaaaaaaaaaaaaaaaaaaa2',
    ]);

    expect(await runDayCloseAutoCloseSweepJob()).toEqual({ enqueuedCount: 2, failedCount: 0 });
    expect(mocks.enqueueDayCloseAutoClose.mock.calls.map((call) => call[0])).toEqual([
      'org_aaaaaaaaaaaaaaaaaaaa1',
      'org_aaaaaaaaaaaaaaaaaaaa2',
    ]);
  });

  it('skips an add Redis refuses — the next hour finds the day still open', async () => {
    mocks.findOrganizationsWithDaysToClose.mockResolvedValueOnce(['org_aaaaaaaaaaaaaaaaaaaa1']);
    mocks.enqueueDayCloseAutoClose.mockRejectedValueOnce(new Error('redis down'));

    expect(await runDayCloseAutoCloseSweepJob()).toEqual({ enqueuedCount: 0, failedCount: 1 });
  });

  it('nothing to close: nothing added', async () => {
    mocks.findOrganizationsWithDaysToClose.mockResolvedValueOnce([]);

    expect(await runDayCloseAutoCloseSweepJob()).toEqual({ enqueuedCount: 0, failedCount: 0 });
  });
});
