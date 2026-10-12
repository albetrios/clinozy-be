import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  findOrganizationId: vi.fn(),
  findDueDays: vi.fn(),
  openUnopenedDay: vi.fn(),
  closeAsExpected: vi.fn(),
}));

vi.mock('@/domains/app/sub-domains/billing/day-closes/day-close-auto-close.repository.js', () => ({
  createWorkerDayCloseAutoCloseRepository: () => repository,
}));
vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runDayCloseAutoCloseJob } from '@/domains/app/sub-domains/billing/day-closes/workers/day-close-auto-close.processor.js';

const ORGANIZATION = 'org_aaaaaaaaaaaaaaaaaaaa1';

/** One organization's auto-close (WC-39, B26): opens the unopened days, closes each as expected. */
describe('runDayCloseAutoCloseJob', () => {
  beforeEach(() => {
    for (const method of Object.values(repository)) method.mockReset();
    repository.findOrganizationId.mockResolvedValue(7);
  });

  it('closes each open past day, opening the ones money moved on but nobody opened', async () => {
    repository.findDueDays.mockResolvedValue([
      { dayCloseId: 11, branchId: 1, closeDate: '2026-10-01' },
      { dayCloseId: null, branchId: 2, closeDate: '2026-10-01' },
    ]);
    repository.openUnopenedDay.mockResolvedValue(12);
    repository.closeAsExpected.mockResolvedValue(true);

    expect(
      await runDayCloseAutoCloseJob({
        databaseHandle: {} as never,
        organizationPublicId: ORGANIZATION,
      }),
    ).toEqual({
      closedCount: 2,
      openedCount: 1,
    });
    expect(repository.openUnopenedDay).toHaveBeenCalledWith({
      organizationId: 7,
      branchId: 2,
      closeDate: '2026-10-01',
    });
    expect(repository.closeAsExpected.mock.calls.map((call) => call[0].dayCloseId)).toEqual([
      11, 12,
    ]);
  });

  it('skips a day closed or opened meanwhile', async () => {
    repository.findDueDays.mockResolvedValue([
      { dayCloseId: null, branchId: 2, closeDate: '2026-10-01' },
      { dayCloseId: 11, branchId: 1, closeDate: '2026-10-01' },
    ]);
    repository.openUnopenedDay.mockResolvedValue(null);
    repository.closeAsExpected.mockResolvedValue(false);

    expect(
      await runDayCloseAutoCloseJob({
        databaseHandle: {} as never,
        organizationPublicId: ORGANIZATION,
      }),
    ).toEqual({
      closedCount: 0,
      openedCount: 0,
    });
  });

  it('an organization that is gone closes nothing', async () => {
    repository.findOrganizationId.mockResolvedValue(null);

    expect(
      await runDayCloseAutoCloseJob({
        databaseHandle: {} as never,
        organizationPublicId: ORGANIZATION,
      }),
    ).toEqual({
      closedCount: 0,
      openedCount: 0,
    });
    expect(repository.findDueDays).not.toHaveBeenCalled();
  });
});
