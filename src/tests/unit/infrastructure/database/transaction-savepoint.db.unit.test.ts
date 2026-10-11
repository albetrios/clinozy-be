import { sql as drizzleSql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { withSavepoint } from '@/infrastructure/database/transaction.js';
import { runWithOnCommitScope, getOnCommitQueue } from '@/core/events/on-commit-scope.js';

const scope = PRINCIPAL_SCOPE.VERIFIED({ organizationPublicId: 'org_savepointprobe0000000' });

/**
 * Against real Postgres: a statement that fails inside `withSavepoint` rolls back to the savepoint
 * and leaves the surrounding transaction usable and committable. Without it the failure aborts the
 * transaction (25P02) and postgres.js rethrows it at COMMIT even though the caller caught it.
 */
describe('withSavepoint', () => {
  it('keeps the surrounding transaction usable after a failed statement inside it', async () => {
    const result = await withAppDatabaseContext({
      scope,
      callback: async () => {
        await expect(
          withSavepoint(() => getRequestDatabase().execute(drizzleSql`SELECT 1 / 0`)),
        ).rejects.toThrow(/SELECT 1 \/ 0/);
        const rows = await getRequestDatabase().execute(drizzleSql`SELECT 42 AS answer`);
        return (rows as unknown as Array<{ answer: number }>)[0]?.answer;
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
