import { sql as drizzleSql } from 'drizzle-orm';
import { runInCommitUnit } from '@/core/events/on-commit-scope.js';
import { database } from '@/infrastructure/database/connection.js';
import {
  getOrganizationRequestDatabaseSession,
  runWithPinnedDatabaseHandle,
  type RequestScopedPostgresDatabase,
} from '@/infrastructure/database/contexts/database-context-runtime.js';
import { runPooledUnitOfWork } from '@/infrastructure/database/contexts/database-context.js';
import { TEN_SECONDS_MS } from '@/shared/constants/ttl.constants.js';

/** Options passed to {@link withTransaction} — per-transaction statement timeout and isolation level. */
export interface TransactionOptions {
  /** Transaction timeout in milliseconds. Default: 10_000 (10 seconds). */
  timeoutMs?: number;
  /** Isolation level. Default: 'read committed'. */
  isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
}

/**
 * Execute a callback inside a database transaction.
 *
 * Supports optional statement_timeout and isolation level.
 * The timeout is set per-transaction to prevent runaway queries.
 *
 * SET LOCAL is executed via the transaction client (not the global pool)
 * so the timeout applies only within this transaction's connection. Runs as a pooled unit of work
 * like every database context: counted by the overload guard, bounded by the acquire deadline.
 */
export async function withTransaction<T>(
  callback: (transaction: unknown) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? TEN_SECONDS_MS;
  const isolationLevel = options?.isolationLevel ?? 'read committed';

  return runPooledUnitOfWork({
    path: 'plain_transaction',
    openTransaction: (claimConnection) =>
      database.transaction(
        async (transaction) => {
          claimConnection();
          await transaction.execute(
            drizzleSql`SET LOCAL statement_timeout = ${drizzleSql.raw(String(timeoutMs))}`,
          );

          return callback(transaction);
        },
        {
          isolationLevel,
        },
      ),
  });
}

/**
 * Runs `callback` in a SAVEPOINT of the transaction pinned for the current unit of work, so a
 * failure inside it cannot fail the work around it.
 *
 * @remarks
 * - **Algorithm:** Drizzle's nested `transaction()` on the pinned handle issues `SAVEPOINT`, and
 *   postgres.js gives the savepoint its own error scope; the savepoint's handle is pinned so every
 *   repository call in `callback` runs inside it. Success releases the savepoint, a throw rolls back
 *   to it and rejects. After-commit tasks registered inside follow the same outcome
 *   ({@link runInCommitUnit}).
 * - **Why:** inside a transaction one failed statement aborts the whole transaction (25P02), and
 *   postgres.js rethrows a failed query at COMMIT even when the caller caught it — so a best-effort
 *   side write (webhook delivery attempts, a notification, a lost-race insert) must run here or it
 *   fails the write that triggered it.
 * - **Failure modes:** rejects with `callback`'s error, the surrounding transaction still usable;
 *   throws when no transaction is pinned (there is nothing to save-point).
 * - **Side effects:** two extra round trips (`SAVEPOINT` / `RELEASE`).
 */
export async function withSavepoint<T>(callback: () => Promise<T>): Promise<T> {
  const session = getOrganizationRequestDatabaseSession();
  if (session === undefined) {
    throw new Error('withSavepoint needs a pinned transaction (run it inside a database context)');
  }
  return runInCommitUnit(() =>
    session.databaseHandle.transaction((savepoint) =>
      runWithPinnedDatabaseHandle(savepoint as unknown as RequestScopedPostgresDatabase, callback),
    ),
  );
}
