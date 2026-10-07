/**
 * Pure helpers for reasoning about a Postgres connection string (SSL mode, pooler
 * detection, strict TLS verification). Kept free of any module-level side effects —
 * importing this file must NOT open a connection pool or trigger env validation — so
 * the migration runner (`migration/migrate.ts`) and boot-time TLS assertion can reuse
 * the same logic without instantiating the process-wide `postgres()` pool in
 * `connection.ts`.
 */

/**
 * Extracts and normalizes the `sslmode` query parameter from a Postgres URL.
 *
 * @remarks
 * - **Algorithm:** matches `?sslmode=` / `&sslmode=` case-insensitively, then
 *   percent-decodes and lowercases the value.
 * - **Failure modes:** returns `null` when the URL carries no `sslmode` parameter.
 * - **Side effects:** none — pure string parsing.
 */
export function parseSslMode(databaseUrl: string): string | null {
  const match = /[?&]sslmode=([^&]+)/i.exec(databaseUrl);
  if (!match?.[1]) return null;
  const raw = match[1];
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    // safe-catch: a malformed percent-encoding is not worth failing connection setup over — use the
    // raw token (already extracted from sslmode=) so a stray `%` still yields a usable mode string.
    return raw.toLowerCase();
  }
}

/**
 * Heuristic for Neon's PgBouncer-fronted connection string — when true we disable
 * postgres.js prepared statements because PgBouncer in transaction-pooling mode
 * does not preserve server-side prepared statement state across checkouts. The same
 * signal also flags a connection that must NOT be used for migrations, because a
 * session-level `pg_advisory_lock` is not pinned to a single backend through a
 * transaction-mode pooler.
 *
 * @remarks
 * - **Algorithm:** matches a `-pooler.` host segment or an explicit `pgbouncer=true`
 *   query parameter.
 * - **Side effects:** none — pure string parsing.
 */
export function isNeonPoolerConnection(databaseUrl: string): boolean {
  return /-pooler\./i.test(databaseUrl) || /[?&]pgbouncer=true/i.test(databaseUrl);
}

/** Inputs for {@link isStrictDatabaseTlsVerification}. */
export interface StrictDatabaseTlsVerificationInput {
  /** The Postgres connection string whose `sslmode` is inspected. */
  databaseUrl: string;
  /** Value of `DATABASE_SSL_REJECT_UNAUTHORIZED` (forces strict verification when `true`). */
  rejectUnauthorizedOverride?: boolean | undefined;
}

/**
 * True when the Postgres client should verify the server's TLS certificate chain.
 *
 * @remarks
 * - **Algorithm:** strict when `sslmode` is `verify-ca` / `verify-full` (the libpq
 *   modes that validate the certificate) OR when `DATABASE_SSL_REJECT_UNAUTHORIZED`
 *   is explicitly `true`. `sslmode=require` encrypts but does NOT verify, so it is
 *   intentionally not treated as strict.
 * - **Side effects:** none — pure computation.
 */
export function isStrictDatabaseTlsVerification({
  databaseUrl,
  rejectUnauthorizedOverride,
}: StrictDatabaseTlsVerificationInput): boolean {
  const sslMode = parseSslMode(databaseUrl);
  return (
    sslMode === 'verify-ca' || sslMode === 'verify-full' || rejectUnauthorizedOverride === true
  );
}

/**
 * Every env variable that carries a Postgres connection URL: the runtime pool, migrations,
 * maintenance contexts, and the local/CI-only operator login.
 *
 * @remarks
 * - **Notes:** the one list the test harness's local-database switch, `pnpm setup:local`'s
 *   environment check and `pnpm verify:base` share.
 */
export const DATABASE_URL_KEYS = [
  'DATABASE_URL',
  'DATABASE_MIGRATION_URL',
  'DATABASE_MAINTENANCE_URL',
  'DATABASE_OPERATOR_URL',
] as const;

/** Hostnames that are this machine, with IPv6 brackets stripped. */
const LOCAL_DATABASE_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Whether a Postgres connection URL points at this machine (a loopback host).
 *
 * @remarks
 * - **Algorithm:** parses the URL and compares its hostname — IPv6 brackets stripped, so
 *   `[::1]` counts — with localhost, 127.0.0.1 and ::1.
 * - **Failure modes:** an unset or unparseable value is not local.
 * - **Side effects:** none — pure string parsing.
 * - **Notes:** the one check the test harness's local-database switch, the bulk-seed guard and
 *   `pnpm setup:local` share.
 */
export function isLocalDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.replace(/^\[(.*)\]$/, '$1');
    return LOCAL_DATABASE_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}
