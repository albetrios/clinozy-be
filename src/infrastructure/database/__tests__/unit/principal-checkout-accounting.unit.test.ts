import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';

const asOrgScope = (organizationPublicId: string) =>
  PRINCIPAL_SCOPE.REQUEST({ organizationPublicId });
import {
  getActiveOrganizationRlsCheckoutCount,
  getOldestConnectionWaitMs,
  type OrganizationRlsCheckoutHoldSample,
  registerOrganizationRlsCheckoutHoldObserver,
  resetOrganizationRlsCheckoutCountForTests,
} from '@/infrastructure/database/pool/organization-rls-checkout-counter.js';
import { withTransaction } from '@/infrastructure/database/transaction.js';

const mockExecute = vi.fn().mockResolvedValue(undefined);
const mockTransactionHandle = { execute: mockExecute, tag: 'transaction-handle' };

vi.mock('@/infrastructure/database/connection.js', () => ({
  database: {
    transaction: vi.fn(
      async (callback: (transaction: typeof mockTransactionHandle) => Promise<unknown>) =>
        callback(mockTransactionHandle),
    ),
  },
}));

describe('withAppDatabaseContext checkout accounting (organization scopes)', () => {
  beforeEach(() => {
    resetOrganizationRlsCheckoutCountForTests();
  });

  afterEach(() => {
    resetOrganizationRlsCheckoutCountForTests();
  });

  it('pins ALS so getRequestDatabase returns the same handle passed to the callback', async () => {
    await withAppDatabaseContext(asOrgScope('org_public_test'), async (databaseHandle) => {
      expect(getRequestDatabase()).toBe(databaseHandle);
      expect(databaseHandle).toBe(mockTransactionHandle);
    });

    expect(mockExecute).toHaveBeenCalled();
    expect(getRequestDatabase()).not.toBe(mockTransactionHandle);
  });

  it('counts a pooled checkout for the unit of work and releases it afterwards', async () => {
    expect(getActiveOrganizationRlsCheckoutCount()).toBe(0);

    await withAppDatabaseContext(asOrgScope('org_public_checkout'), async () => {
      expect(getActiveOrganizationRlsCheckoutCount()).toBe(1);
    });

    expect(getActiveOrganizationRlsCheckoutCount()).toBe(0);
  });

  it('does not open a second checkout when the same organization is reused in a nested context', async () => {
    await withAppDatabaseContext(asOrgScope('org_public_nested'), async () => {
      expect(getActiveOrganizationRlsCheckoutCount()).toBe(1);
      await withAppDatabaseContext(asOrgScope('org_public_nested'), async () => {
        expect(getActiveOrganizationRlsCheckoutCount()).toBe(1);
      });
      expect(getActiveOrganizationRlsCheckoutCount()).toBe(1);
    });

    expect(getActiveOrganizationRlsCheckoutCount()).toBe(0);
  });

  it('reports a scoped_context hold-time sample to the registered observer', async () => {
    const samples: OrganizationRlsCheckoutHoldSample[] = [];
    registerOrganizationRlsCheckoutHoldObserver((sample) => {
      samples.push(sample);
    });

    await withAppDatabaseContext(asOrgScope('org_public_hold'), async () => undefined);

    expect(samples).toHaveLength(1);
    expect(samples[0]?.path).toBe('scoped_context');
    expect(samples[0]?.durationSeconds).toBeGreaterThanOrEqual(0);
  });

  it('releases the checkout and records hold time even when the callback throws', async () => {
    const samples: OrganizationRlsCheckoutHoldSample[] = [];
    registerOrganizationRlsCheckoutHoldObserver((sample) => {
      samples.push(sample);
    });

    await expect(
      withAppDatabaseContext(asOrgScope('org_public_throw'), async () => {
        throw new Error('unit-of-work failed');
      }),
    ).rejects.toThrow('unit-of-work failed');

    expect(getActiveOrganizationRlsCheckoutCount()).toBe(0);
    expect(samples).toHaveLength(1);
    expect(samples[0]?.path).toBe('scoped_context');
  });

  it('counts a user-only unit of work too — it holds a pooled connection all the same', async () => {
    await withAppDatabaseContext(
      PRINCIPAL_SCOPE.REQUEST({ userPublicId: 'usr_public_checkout' }),
      async () => {
        expect(getActiveOrganizationRlsCheckoutCount()).toBe(1);
      },
    );

    expect(getActiveOrganizationRlsCheckoutCount()).toBe(0);
  });

  it('counts a withTransaction unit and reports its hold as plain_transaction', async () => {
    const samples: OrganizationRlsCheckoutHoldSample[] = [];
    registerOrganizationRlsCheckoutHoldObserver((sample) => {
      samples.push(sample);
    });

    await withTransaction(async () => {
      expect(getActiveOrganizationRlsCheckoutCount()).toBe(1);
    });

    expect(getActiveOrganizationRlsCheckoutCount()).toBe(0);
    expect(samples.map((sample) => sample.path)).toEqual(['plain_transaction']);
  });

  it('tracks the wait for a connection until the unit of work claims one', async () => {
    let releaseConnection: () => void = () => undefined;
    const connectionArrives = new Promise<void>((resolve) => {
      releaseConnection = resolve;
    });
    const { database } = await import('@/infrastructure/database/connection.js');
    vi.mocked(database.transaction).mockImplementationOnce(async (callback) => {
      await connectionArrives;
      return callback(mockTransactionHandle as never);
    });
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);

    const unitOfWork = withAppDatabaseContext(asOrgScope('org_public_waiting'), async () => {
      // Claimed: no longer a waiter.
      expect(getOldestConnectionWaitMs()).toBe(0);
    });
    now.mockReturnValue(1_750);
    expect(getOldestConnectionWaitMs()).toBe(750);

    releaseConnection();
    await unitOfWork;
    expect(getOldestConnectionWaitMs()).toBe(0);
    now.mockRestore();
  });
});
