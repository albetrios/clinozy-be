import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/**
 * Longest a migration statement waits for a lock. A DDL statement waiting for a lock holds its
 * place in that table's lock queue, so every later query on the table — the application's
 * traffic — queues behind it: an outage lasting as long as the wait. Failing fast and retrying
 * the file is the safer trade.
 */
export const MIGRATION_LOCK_TIMEOUT_MS = 5_000;

/**
 * Longest one statement of a transactional migration may run once it holds its locks.
 * Migrations carry no data backfills, so DDL running longer is a runaway — a table rewrite the
 * lint missed — sitting on an exclusive lock.
 */
export const MIGRATION_STATEMENT_TIMEOUT_MS = 300_000;

/** Attempts per transactional migration file when its lock wait times out. */
export const MIGRATION_LOCK_TIMEOUT_ATTEMPTS = 3;

/** Pause between those attempts, letting the transaction that holds the lock finish. */
export const MIGRATION_LOCK_TIMEOUT_RETRY_DELAY_MS = 3_000;

/** Whether `error` is Postgres SQLSTATE 55P03 `lock_not_available` — what `lock_timeout` raises. */
export function isMigrationLockTimeoutError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '55P03'
  );
}

/** The one method shared by a postgres.js transaction and the pinned migration session. */
interface MigrationSettingExecutor {
  unsafe: (query: string) => PromiseLike<unknown>;
}

/**
 * Applies the migration timeouts before a file's statements run.
 *
 * @remarks
 * - **Algorithm:** `scope: 'transaction'` (the default lane) sets both timeouts with `SET LOCAL`,
 *   so they end with the transaction. `scope: 'session'` (the non-transactional lane, where every
 *   `CREATE INDEX CONCURRENTLY` runs) sets the lock timeout and lifts the statement timeout (`0`):
 *   a concurrent build on a large table legitimately runs long, and it blocks no writes. The
 *   caller resets the session settings when the file is done.
 * - **Failure modes:** none beyond the executor's own errors.
 * - **Side effects:** two `SET` statements on the executor.
 * - **Notes:** the timeouts are parameters only so a test can shorten them.
 */
export async function applyMigrationTimeouts(options: {
  executor: MigrationSettingExecutor;
  scope: 'transaction' | 'session';
  lockTimeoutMs?: number;
  statementTimeoutMs?: number;
}): Promise<void> {
  const lockTimeoutMs = options.lockTimeoutMs ?? MIGRATION_LOCK_TIMEOUT_MS;
  if (options.scope === 'transaction') {
    const statementTimeoutMs = options.statementTimeoutMs ?? MIGRATION_STATEMENT_TIMEOUT_MS;
    await options.executor.unsafe(`SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`);
    await options.executor.unsafe(`SET LOCAL statement_timeout = '${statementTimeoutMs}ms'`);
    return;
  }
  await options.executor.unsafe(`SET lock_timeout = '${lockTimeoutMs}ms'`);
  await options.executor.unsafe('SET statement_timeout = 0');
}

/**
 * Runs one transactional migration file, retrying it when its lock wait times out.
 *
 * @remarks
 * - **Algorithm:** calls `run` (which opens the file's transaction); on SQLSTATE 55P03 the
 *   transaction has already rolled back, so the whole file is safe to run again after `delayMs`,
 *   up to `attempts` times in all.
 * - **Failure modes:** any other error is rethrown at once; the last lock timeout is rethrown
 *   after the final attempt, failing the migration run (and with it the deploy) without having
 *   held traffic behind a lock.
 * - **Side effects:** one warn log per retried attempt (`migration.lock_timeout.retry`).
 * - **Notes:** never wrap the non-transactional lane in this — a failed `CREATE INDEX
 *   CONCURRENTLY` leaves an INVALID index that an operator drops before re-running.
 */
export async function retryOnMigrationLockTimeout<T>(options: {
  filename: string;
  run: () => Promise<T>;
  attempts?: number;
  delayMs?: number;
}): Promise<T> {
  const attempts = options.attempts ?? MIGRATION_LOCK_TIMEOUT_ATTEMPTS;
  const delayMs = options.delayMs ?? MIGRATION_LOCK_TIMEOUT_RETRY_DELAY_MS;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await options.run();
    } catch (error) {
      if (!isMigrationLockTimeoutError(error) || attempt >= attempts) throw error;
      logger.warn(
        { filename: options.filename, attempt, attempts, delayMs },
        'migration.lock_timeout.retry',
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
