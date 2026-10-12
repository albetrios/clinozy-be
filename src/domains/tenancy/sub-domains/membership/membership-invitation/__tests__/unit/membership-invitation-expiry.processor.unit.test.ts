import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { MILLISECONDS_PER_DAY } from '@/shared/constants/index.js';

const dueRows = vi.hoisted(() => ({
  value: [] as Array<{ membership_public_id: string; organization_public_id: string }>,
}));
const captureExceptionMock = vi.hoisted(() => vi.fn());

// The maintenance context runs its callback; the repository's scan answers the rows the test set.
vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    withMaintenanceDatabaseContext: vi.fn(
      async ({ callback }: { callback: (databaseHandle: unknown) => Promise<unknown> }) =>
        callback({}),
    ),
  };
});

vi.mock(
  '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.repository.js',
  () => ({
    findInvitedMembershipsDueForSeatRelease: vi.fn(async () => dueRows.value),
  }),
);

vi.mock('@/infrastructure/observability/sentry/sentry.js', () => ({
  captureException: captureExceptionMock,
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { runMembershipInvitationExpiryJob } = await import(
  '@/domains/tenancy/sub-domains/membership/membership-invitation/workers/membership-invitation-expiry.processor.js'
);

/** One due row: an invited membership in some organization. */
function dueRow() {
  return {
    membership_public_id: generatePublicId('membership'),
    organization_public_id: generatePublicId('organization'),
  };
}

describe('runMembershipInvitationExpiryJob (launch D84 (4))', () => {
  const now = new Date('2026-10-10T04:10:00.000Z');

  beforeEach(() => {
    dueRows.value = [];
    captureExceptionMock.mockReset();
  });

  it('ends each due membership with a cutoff 7 days before now, counting ended and skipped', async () => {
    const [first, second] = [dueRow(), dueRow()];
    dueRows.value = [first, second];
    const endExpiredInvitation = vi
      .fn<(options: { expiredBefore: Date }) => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await runMembershipInvitationExpiryJob({
      service: { endExpiredInvitation },
      now,
    });

    expect(result).toEqual({ scanned: 2, ended: 1, skipped: 1, failed: 0 });
    expect(endExpiredInvitation).toHaveBeenNthCalledWith(1, {
      organizationPublicId: first.organization_public_id,
      membershipPublicId: first.membership_public_id,
      expiredBefore: new Date(now.getTime() - 7 * MILLISECONDS_PER_DAY),
    });
  });

  it('a failing membership is counted and reported, and the rest still run', async () => {
    dueRows.value = [dueRow(), dueRow()];
    const endExpiredInvitation = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(true);

    const result = await runMembershipInvitationExpiryJob({
      service: { endExpiredInvitation },
      now,
    });

    expect(result).toEqual({ scanned: 2, ended: 1, skipped: 0, failed: 1 });
    expect(captureExceptionMock).toHaveBeenCalledOnce();
  });

  it('does nothing when nothing is due', async () => {
    const endExpiredInvitation = vi.fn();

    expect(
      await runMembershipInvitationExpiryJob({ service: { endExpiredInvitation }, now }),
    ).toEqual({
      scanned: 0,
      ended: 0,
      skipped: 0,
      failed: 0,
    });
    expect(endExpiredInvitation).not.toHaveBeenCalled();
  });
});
