import { sql as drizzleSql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import type { database } from '@/infrastructure/database/connection.js';
import {
  MAINTENANCE_SCOPE,
  PRINCIPAL_SCOPE,
  SESSION_SCOPE,
  withAppDatabaseContext,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { withSavepoint, withTransaction } from '@/infrastructure/database/transaction.js';
import { runWithOnCommitScope, getOnCommitQueue } from '@/core/events/on-commit-scope.js';

const scope = PRINCIPAL_SCOPE.VERIFIED({ organizationPublicId: 'org_savepointprobe0000000' });

/**
 * Against real Postgres: a statement that fails inside `withSavepoint` rolls back to the savepoint
 * and leaves the surrounding transaction usable and committable. Without it the failure aborts the
 * transaction (25P02), and the unit of work refuses to commit it even though the caller caught it.
 */
describe('withSavepoint', () => {
  it('keeps the surrounding transaction usable after a failed statement inside it', async () => {
    const result = await withAppDatabaseContext({
      scope,
      callback: async () => {
        await expect(
          withSavepoint(() => getRequestDatabase().execute(drizzleSql`SELECT 1 / 0`)),
        ).rejects.toThrow(/SELECT 1 \/ 0/);
        const result = await getRequestDatabase().execute<{ answer: number }>(
          drizzleSql`SELECT 42 AS answer`,
        );
        const rows = Array.isArray(result)
          ? (result as { answer: number }[])
          : ((result as { rows?: { answer: number }[] }).rows ?? []);
        return rows[0]?.answer;
      },
    });
    expect(result).toBe(42);
  });

  it("drops the after-commit tasks of a rolled-back savepoint and keeps a released one's", async () => {
    const ran: string[] = [];
    await runWithOnCommitScope(async () => {
      await withAppDatabaseContext({
        scope,
        callback: async () => {
          await withSavepoint(async () => {
            getOnCommitQueue()?.tasks.push(async () => {
              ran.push('released');
            });
          });
          await withSavepoint(async () => {
            getOnCommitQueue()?.tasks.push(async () => {
              ran.push('rolled back');
            });
            throw new Error('roll back');
          }).catch(() => undefined);
        },
      });
      // Both units are done; the request queue holds what survived.
      for (const task of getOnCommitQueue()?.tasks ?? []) await task();
    });
    expect(ran).toEqual(['released']);
  });

  it('refuses to run outside a database context', async () => {
    await expect(withSavepoint(async () => 'nothing to save-point')).rejects.toThrow(
      /needs a pinned transaction/,
    );
  });
});

/**
 * Postgres answers COMMIT of an aborted transaction by rolling back without an error, so a unit of
 * work whose callback caught a failed statement would report success with none of its writes kept.
 * Every way a transaction is opened refuses it instead.
 */
describe('a failed statement whose error the callback caught', () => {
  /** Runs a statement that fails, swallows the error, and carries on as if it had not. */
  const swallowFailure = async () => {
    await getRequestDatabase()
      .execute(drizzleSql`SELECT 1 / 0`)
      .catch(() => undefined);
    return 'reported success';
  };

  it.each([
    {
      opener: 'withAppDatabaseContext (principal)',
      run: () => withAppDatabaseContext({ scope, callback: swallowFailure }),
    },
    {
      opener: 'withAppDatabaseContext (session artifact)',
      run: () =>
        withAppDatabaseContext({
          scope: SESSION_SCOPE.ARTIFACT({ sessionPublicId: 'ses_savepointprobe0000000' }),
          callback: swallowFailure,
        }),
    },
    {
      opener: 'withMaintenanceDatabaseContext',
      run: () =>
        withMaintenanceDatabaseContext({
          scope: MAINTENANCE_SCOPE.GLOBAL_RETENTION_CLEANUP,
          callback: swallowFailure,
        }),
    },
    {
      opener: 'withTransaction',
      run: () =>
        withTransaction({
          callback: async (transaction) => {
            await (transaction as typeof database)
              .execute(drizzleSql`SELECT 1 / 0`)
              .catch(() => undefined);
            return 'reported success';
          },
        }),
    },
  ])('$opener: rejects instead of committing nothing', async ({ run }) => {
    await expect(run()).rejects.toThrow(/failed_statement_caught/);
  });
});
