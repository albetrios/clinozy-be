import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAINTENANCE_SCOPE,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { WorkerDatabaseContextError } from '@/infrastructure/database/contexts/database-context-runtime.js';
import {
  assertWorkerDatabaseContext,
  assertWorkerForceRlsTableAccess,
  getWorkerDatabaseContext,
  isWorkerRuntime,
  runWithWorkerDatabaseContext,
} from '@/infrastructure/database/contexts/database-context-runtime.js';

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

describe('worker database context', () => {
  const originalRuntime = process.env.CLINOZY_BE_RUNTIME;

  afterEach(() => {
    if (originalRuntime === undefined) {
      delete process.env.CLINOZY_BE_RUNTIME;
    } else {
      process.env.CLINOZY_BE_RUNTIME = originalRuntime;
    }
  });

  it('isWorkerRuntime returns true when CLINOZY_BE_RUNTIME is worker', () => {
    process.env.CLINOZY_BE_RUNTIME = 'worker';
    expect(isWorkerRuntime()).toBe(true);
  });

  it('assertWorkerDatabaseContext throws in worker runtime without pinned context', () => {
    process.env.CLINOZY_BE_RUNTIME = 'worker';
    expect(() => assertWorkerDatabaseContext()).toThrow(WorkerDatabaseContextError);
  });

  it('getRequestDatabase throws in worker runtime without pinned context', () => {
    process.env.CLINOZY_BE_RUNTIME = 'worker';
    expect(() => getRequestDatabase()).toThrow(WorkerDatabaseContextError);
  });

  it('withAppDatabaseContext sets organization worker context kind', async () => {
    process.env.CLINOZY_BE_RUNTIME = 'worker';
    const scope = PRINCIPAL_SCOPE.JOB({
      organizationPublicId: 'org_public_test',
    });
    await withAppDatabaseContext({
      scope,
      callback: async () => {
        expect(getWorkerDatabaseContext()?.kind).toBe('organization');
        expect(getWorkerDatabaseContext()?.organizationPublicId).toBe('org_public_test');
      },
    });
  });

  it('withMaintenanceDatabaseContext sets global_retention_cleanup kind', async () => {
    process.env.CLINOZY_BE_RUNTIME = 'worker';
    await withMaintenanceDatabaseContext({
      scope: MAINTENANCE_SCOPE.GLOBAL_RETENTION_CLEANUP,
      callback: async () => {
        expect(getWorkerDatabaseContext()?.kind).toBe('global_retention_cleanup');
      },
    });
  });

  it('MAINTENANCE_SCOPE.SYSTEM_TABLE_WORKER sets system_table kind in worker runtime', async () => {
    process.env.CLINOZY_BE_RUNTIME = 'worker';
    await withMaintenanceDatabaseContext({
      scope: MAINTENANCE_SCOPE.SYSTEM_TABLE_WORKER,
      callback: async () => {
        expect(getWorkerDatabaseContext()?.kind).toBe('system_table');
        expect(() => getRequestDatabase()).not.toThrow();
      },
    });
  });

  it('assertWorkerForceRlsTableAccess rejects system_table for FORCE RLS tables', async () => {
    process.env.CLINOZY_BE_RUNTIME = 'worker';
    await runWithWorkerDatabaseContext({
      context: { kind: 'system_table' },
      callback: async () => {
        expect(() =>
          assertWorkerForceRlsTableAccess({ schemaName: 'billing', tableName: 'subscriptions' }),
        ).toThrow(WorkerDatabaseContextError);
      },
    });
  });

  it('assertWorkerForceRlsTableAccess allows organization context for tenant tables', async () => {
    process.env.CLINOZY_BE_RUNTIME = 'worker';
    const scope = PRINCIPAL_SCOPE.JOB({
      organizationPublicId: 'org_public_test',
    });
    await withAppDatabaseContext({
      scope,
      callback: async () => {
        expect(() =>
          assertWorkerForceRlsTableAccess({ schemaName: 'billing', tableName: 'subscriptions' }),
        ).not.toThrow();
      },
    });
  });

  it('sec-new-Q4: MAINTENANCE_SCOPE.SYSTEM_TABLE_RETENTION sets system_table kind in worker runtime', async () => {
    process.env.CLINOZY_BE_RUNTIME = 'worker';
    await withMaintenanceDatabaseContext({
      scope: MAINTENANCE_SCOPE.SYSTEM_TABLE_RETENTION,
      callback: async () => {
        expect(getWorkerDatabaseContext()?.kind).toBe('system_table');
        expect(() => getRequestDatabase()).not.toThrow();
      },
    });
  });

  it('sec-new-Q4: system_table_retention opens a transaction and applies statement timeout', async () => {
    process.env.CLINOZY_BE_RUNTIME = 'worker';
    const { database: mockedDatabase } = await import('@/infrastructure/database/connection.js');
    mockExecute.mockClear();
    await withMaintenanceDatabaseContext({
      scope: MAINTENANCE_SCOPE.SYSTEM_TABLE_RETENTION,
      callback: async () => {
        /* pure-DB callback */
      },
    });
    // A transaction must be opened (so SET LOCAL statement_timeout takes effect)
    expect(mockedDatabase.transaction).toHaveBeenCalled();
    // applyWorkerStatementTimeout calls databaseHandle.execute() with the SET LOCAL statement
    expect(mockExecute).toHaveBeenCalled();
  });
});
