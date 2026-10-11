import { describe, it, expect, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { database } from '@/infrastructure/database/connection.js';
import { withTransaction } from '@/infrastructure/database/transaction.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { users } from '@/domains/user/user.schema.js';

describe('withTransaction', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('commits when callback resolves', async () => {
    const user = await createTestUser({ email: 'txn-commit@example.com' });
    await withTransaction({
      callback: async (transaction) => {
        await (transaction as typeof database)
          .update(users)
          .set({ first_name: 'Committed' })
          .where(eq(users.id, user.id));
      },
    });

    const [row] = await database.select().from(users).where(eq(users.id, user.id));
    expect(row?.first_name).toBe('Committed');
  });

  it('rolls back when callback throws', async () => {
    const user = await createTestUser({ email: 'txn-rollback@example.com' });
    await expect(
      withTransaction({
        callback: async (transaction) => {
          await (transaction as typeof database)
            .update(users)
            .set({ first_name: 'ShouldRollback' })
            .where(eq(users.id, user.id));
          throw new Error('force rollback');
        },
      }),
    ).rejects.toThrow('force rollback');

    const [row] = await database.select().from(users).where(eq(users.id, user.id));
    expect(row?.first_name).not.toBe('ShouldRollback');
  });

  it('propagates the original error message', async () => {
    await expect(
      withTransaction({
        callback: async () => {
          throw new Error('original-txn-error');
        },
      }),
    ).rejects.toThrow('original-txn-error');
  });

  it('sets local statement_timeout inside the transaction', async () => {
    let timeoutSetting: string | null = null;
    await withTransaction({
      callback: async (transaction) => {
        const result = await (transaction as typeof database).execute<{ timeout: string }>(
          sql`SELECT current_setting('statement_timeout', true) AS timeout`,
        );
        const rows = Array.isArray(result)
          ? (result as { timeout: string }[])
          : ((result as { rows?: { timeout: string }[] }).rows ?? []);
        timeoutSetting = rows[0]?.timeout ?? null;
      },
      options: { timeoutMs: 5_000 },
    });
    expect(timeoutSetting === '5000ms' || timeoutSetting === '5s').toBe(true);
  });
});
