import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyMigrationTimeouts,
  isMigrationLockTimeoutError,
  retryOnMigrationLockTimeout,
} from '@/infrastructure/database/migration/migration-lock-timeout.js';
import { getOperatorPool } from '@/tests/helpers/operator-database.js';

/**
 * Against real Postgres: while another transaction holds a table's lock, a migration statement
 * gives up after its lock timeout — instead of queueing the table's traffic behind it — and the
 * file is retried; once the lock is released the same file applies.
 */
const PROBE_TABLE = 'public.migration_lock_timeout_probe';

/** `work` in one transaction on its own client, the way `migrate.ts` runs a file. */
async function inTransaction(work: (client: pg.PoolClient) => Promise<void>): Promise<void> {
  const client = await getOperatorPool().connect();
  try {
    await client.query('BEGIN');
    try {
      await work(client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } finally {
    client.release();
  }
}

describe('migration lock timeout against a held lock', () => {
  beforeAll(async () => {
    await getOperatorPool().query(`CREATE TABLE IF NOT EXISTS ${PROBE_TABLE} (id int)`);
  });

  afterAll(async () => {
    await getOperatorPool().query(`DROP TABLE IF EXISTS ${PROBE_TABLE}`);
  });

  /** One migration "file": the timeouts, then an ALTER that needs the table's exclusive lock. */
  const applyProbeMigration = (column: string) =>
    inTransaction(async (client) => {
      await applyMigrationTimeouts({
        executor: client,
        scope: 'transaction',
        lockTimeoutMs: 200,
      });
      await client.query(`ALTER TABLE ${PROBE_TABLE} ADD COLUMN IF NOT EXISTS ${column} int`);
    });

  it('gives up and retries while the lock is held, then applies once it is released', async () => {
    let releaseLock: () => void = () => undefined;
    let lockHeld: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      lockHeld = resolve;
    });
    const holder = inTransaction(async (client) => {
      await client.query(`LOCK TABLE ${PROBE_TABLE} IN ACCESS EXCLUSIVE MODE`);
      lockHeld();
      await new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
    });
    await held;

    const started = Date.now();
    let attempts = 0;
    const failure = await retryOnMigrationLockTimeout({
      filename: 'probe.sql',
      attempts: 2,
      delayMs: 10,
      run: () => {
        attempts += 1;
        return applyProbeMigration('blocked_column');
      },
    }).then(
      () => null,
      (error: unknown) => error,
    );
    const elapsedMs = Date.now() - started;

    expect(isMigrationLockTimeoutError(failure)).toBe(true);
    expect(attempts).toBe(2);
    // Two 200 ms waits plus the retry pause — nowhere near an unbounded wait.
    expect(elapsedMs).toBeLessThan(5_000);

    releaseLock();
    await holder;
    await applyProbeMigration('applied_column');
    const {
      rows: [columns],
    } = await getOperatorPool().query<{ count: number }>(`
      SELECT count(*)::int AS count FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'migration_lock_timeout_probe'
        AND column_name IN ('blocked_column', 'applied_column')
    `);
    expect(columns?.count).toBe(1);
  });
});
