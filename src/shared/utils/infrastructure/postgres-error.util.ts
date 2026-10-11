/**
 * Postgres / driver error helpers (node-postgres's `DatabaseError` carries the SQLSTATE as `code`).
 */
import { DEFAULT_TRANSIENT_RETRY_ATTEMPTS } from '@/shared/constants/limits.constants.js';

const POSTGRES_UNIQUE_VIOLATION = '23505';
const POSTGRES_EXCLUSION_VIOLATION = '23P01';
const POSTGRES_LOCK_NOT_AVAILABLE = '55P03';
const POSTGRES_FOREIGN_KEY_VIOLATION = '23503';
const POSTGRES_CHECK_VIOLATION = '23514';
const POSTGRES_NOT_NULL_VIOLATION = '23502';
const MAX_CAUSE_DEPTH = 5;

/**
 * SQLSTATE class 08 (connection_exception) codes plus Node socket-error codes that indicate the
 * connection dropped underneath an in-flight query rather than the query itself being wrong. Managed
 * Postgres (Neon, Railway) closes idle connections (~5 min) and recycles pooler backends, so a query
 * issued the instant a connection is reaped fails transiently even though a retry on a fresh
 * connection succeeds. Query-logic errors (constraint violations, syntax, permission) are NOT here —
 * they must never be retried.
 */
const TRANSIENT_CONNECTION_ERROR_CODES = new Set<string>([
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '57P01', // admin_shutdown (server closed the connection)
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
]);

/**
 * node-postgres reports a connection that dropped under a query without a `code`: the query in
 * flight fails with the first message, and a later query on the same broken client with the second.
 */
const TRANSIENT_CONNECTION_ERROR_MESSAGES = new Set<string>([
  'Connection terminated unexpectedly',
  'Client has encountered a connection error and is not queryable',
]);

const TRANSIENT_RETRY_BASE_DELAY_MS = 25;

/**
 * What a new connection fails with while the database cannot take one: Node.js socket codes for a
 * host that cannot be reached, and the SQLSTATEs a server answers with while it is full or starting.
 */
const DATABASE_UNAVAILABLE_ERROR_CODES = new Set<string>([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  '53300', // too_many_connections
  '57P03', // cannot_connect_now
]);

/**
 * node-postgres's code-less errors for a connection it could not open, or a pooled one that did not
 * free up, within `connectionTimeoutMillis`.
 */
const DATABASE_UNAVAILABLE_ERROR_MESSAGES = new Set<string>([
  'timeout exceeded when trying to connect',
  'Connection terminated due to connection timeout',
  'timeout expired',
]);

/**
 * Returns true when `error` — or any error in its `cause` chain — carries the
 * given SQLSTATE `code`. Drizzle wraps the driver's `DatabaseError` (which holds
 * the SQLSTATE) in `error.cause`, so a top-level-only check misses the code and
 * a concurrent unique-violation loser would surface as a 500 instead of a 409.
 */
function hasPostgresErrorCode({ error, code }: { error: unknown; code: string }): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) return false;
    if ((current as { code?: unknown }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Returns true when `error` is a Postgres `unique_violation` (SQLSTATE 23505). */
export function isPostgresUniqueViolation(error: unknown): boolean {
  return hasPostgresErrorCode({ error, code: POSTGRES_UNIQUE_VIOLATION });
}

/**
 * Returns true when `error` is a Postgres `exclusion_violation` (SQLSTATE 23P01) — an `EXCLUDE`
 * constraint refused the row (a phone number already in another household).
 */
export function isPostgresExclusionViolation(error: unknown): boolean {
  return hasPostgresErrorCode({ error, code: POSTGRES_EXCLUSION_VIOLATION });
}

/**
 * Returns true when `error` is a Postgres `lock_not_available` (SQLSTATE 55P03) — the statement
 * was cancelled because it waited longer than `lock_timeout` for a lock.
 *
 * @remarks
 * `DATABASE_LOCK_TIMEOUT_MS` bounds lock waits so a blocked statement cannot hold its pooled
 * connection indefinitely. That bound also applies to `pg_advisory_xact_lock`, which the quota
 * guards use to serialize count+insert, so heavy contention on one scope surfaces here instead of
 * queueing forever. It is transient: the same request retried after the contention clears
 * succeeds, which is why the caller maps it to 409 rather than 500.
 */
export function isPostgresLockTimeout(error: unknown): boolean {
  return hasPostgresErrorCode({ error, code: POSTGRES_LOCK_NOT_AVAILABLE });
}

/** Returns true when `error` is a Postgres `foreign_key_violation` (SQLSTATE 23503). */
export function isPostgresForeignKeyViolation(error: unknown): boolean {
  return hasPostgresErrorCode({ error, code: POSTGRES_FOREIGN_KEY_VIOLATION });
}

/**
 * Whether a delete was refused because of the rows that point at it — a foreign key with no
 * action (23503), or a cascaded `SET NULL` that a CHECK (23514) or NOT NULL (23502) refuses.
 * Retention jobs count such a row as blocked and keep going (schema review H1).
 */
export function isPostgresDeleteBlockedByReferences(error: unknown): boolean {
  return (
    hasPostgresErrorCode({ error, code: POSTGRES_FOREIGN_KEY_VIOLATION }) ||
    hasPostgresErrorCode({ error, code: POSTGRES_CHECK_VIOLATION }) ||
    hasPostgresErrorCode({ error, code: POSTGRES_NOT_NULL_VIOLATION })
  );
}

/**
 * Returns the violated unique, exclusion or check constraint (or index) name from a Postgres error (or
 * any error in its `cause` chain), if present.
 */
export function getPostgresConstraintName(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) return undefined;
    const name = (current as { constraint?: unknown }).constraint;
    if (typeof name === 'string') return name;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Returns true when `error` — or any error in its `cause` chain — is a transient connection drop
 * (SQLSTATE class 08, admin shutdown, or a Node socket reset) rather than a query-logic error.
 *
 * @remarks
 * - **Algorithm:** walks the `cause` chain (Drizzle wraps the driver error) checking each link's
 *   `code` against {@link TRANSIENT_CONNECTION_ERROR_CODES} and its `message` against
 *   {@link TRANSIENT_CONNECTION_ERROR_MESSAGES} (node-postgres's code-less connection drops).
 * - **Notes:** intentionally narrow — only errors that a retry on a fresh connection could plausibly
 *   resolve. Constraint/syntax/permission errors return false so callers never retry a doomed query.
 */
export function isTransientConnectionError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) return false;
    const { code, message } = current as { code?: unknown; message?: unknown };
    if (typeof code === 'string' && TRANSIENT_CONNECTION_ERROR_CODES.has(code)) return true;
    if (typeof message === 'string' && TRANSIENT_CONNECTION_ERROR_MESSAGES.has(message))
      return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Returns true when `error` — or any error in its `cause` chain — says the database could not give
 * a connection at all: unreachable, refusing, full, starting up, or not answering in time — or a
 * connection that dropped ({@link isTransientConnectionError}).
 *
 * @remarks
 * - **Why:** node-postgres fails a checkout at once when the connection cannot be opened, and after
 *   `connectionTimeoutMillis` when nothing frees up. Those failures mean the database is
 *   unavailable, not that the request was wrong: the unit of work answers 503 with `Retry-After`,
 *   as the acquire deadline does, instead of a 500.
 * - **Notes:** a login refused for a reason that will not go away by itself (a wrong password,
 *   SQLSTATE 28P01; a missing database, 3D000) is not here — it is a misconfiguration and stays a 500.
 */
export function isDatabaseUnavailableError(error: unknown): boolean {
  if (isTransientConnectionError(error)) return true;
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) return false;
    const { code, message } = current as { code?: unknown; message?: unknown };
    if (typeof code === 'string' && DATABASE_UNAVAILABLE_ERROR_CODES.has(code)) return true;
    if (typeof message === 'string' && DATABASE_UNAVAILABLE_ERROR_MESSAGES.has(message)) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Runs an **idempotent, autocommit** read, retrying it a bounded number of times when it fails with a
 * transient connection drop ({@link isTransientConnectionError}).
 *
 * @remarks
 * - **Algorithm:** up to `maxAttempts` calls; between attempts waits a short linear backoff
 *   (`TRANSIENT_RETRY_BASE_DELAY_MS * attempt`) to let the pool open a fresh connection.
 * - **Failure modes:** a non-transient error (or the final attempt) rethrows unchanged.
 * - **Side effects:** none beyond re-invoking `read`. **Caller contract:** `read` MUST be a read with
 *   no side effects and MUST NOT run inside an open transaction — a mid-transaction connection drop
 *   aborts the whole transaction, so re-issuing only the read would run on an aborted handle. Use
 *   only on standalone autocommit reads (e.g. pre-handler auth lookups).
 */
export async function runReadWithTransientRetry<T>({
  read,
  maxAttempts = DEFAULT_TRANSIENT_RETRY_ATTEMPTS,
}: {
  read: () => Promise<T>;
  maxAttempts?: number | undefined;
}): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      lastError = error;
      if (!isTransientConnectionError(error) || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_BASE_DELAY_MS * attempt));
    }
  }
  throw lastError;
}

/**
 * Retries an insert ONLY when the `public_id` index collides. Regenerating a
 * `public_id` cannot resolve a collision on any other unique index (e.g. a slug),
 * so retrying those is futile — and, worse, each retry runs on the already-aborted
 * transaction and surfaces as a `25P02 in_failed_sql_transaction` (a 500). For a
 * non-`public_id` unique violation we rethrow immediately so the caller can map it
 * to a 409 and the transaction rolls back cleanly. The callback must generate a new
 * `public_id` on each attempt (call inside the callback).
 */
export async function runInsertWithPublicIdentifierRetry<T>({
  insert,
  maxAttempts = 5,
}: {
  insert: () => Promise<T>;
  maxAttempts?: number | undefined;
}): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await insert();
    } catch (error) {
      lastError = error;
      const isPublicIdCollision =
        isPostgresUniqueViolation(error) &&
        (getPostgresConstraintName(error)?.includes('public_id') ?? false);
      if (!isPublicIdCollision || attempt === maxAttempts) {
        throw error;
      }
    }
  }
  throw lastError;
}
