/**
 * Pure helpers for reasoning about a Postgres connection string (SSL mode, pooler
 * detection, strict TLS verification, the node-postgres `ssl` option). Kept free of any
 * module-level side effects — importing this file must NOT open a connection pool or
 * trigger env validation — so the migration runner (`migration/migrate.ts`) and boot-time
 * TLS assertion can reuse the same logic without instantiating the process-wide
 * node-postgres pool in `connection.ts`.
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
 * Heuristic for Neon's PgBouncer-fronted connection string — a connection that must NOT
 * be used for migrations, because a
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

/**
 * The node-postgres `ssl` option for `databaseUrl`, decided once from its `sslmode`.
 *
 * @remarks
 * - **Algorithm:** `sslmode=disable` → no TLS; any other `sslmode`, or none with
 *   `sslEnabledByDefault`, → TLS. The certificate is verified for `verify-ca` / `verify-full` or
 *   when `rejectUnauthorizedOverride` is `true` ({@link isStrictDatabaseTlsVerification}); a plain
 *   `require` encrypts without verifying, as libpq does (Railway's proxy presents a self-signed
 *   certificate).
 * - **Failure modes:** none — pure.
 */
export function resolveDatabaseSsl({
  databaseUrl,
  sslEnabledByDefault,
  rejectUnauthorizedOverride,
}: {
  databaseUrl: string;
  sslEnabledByDefault: boolean;
  rejectUnauthorizedOverride?: boolean | undefined;
}): false | { rejectUnauthorized: boolean } {
  const sslMode = parseSslMode(databaseUrl);
  const sslEnabled = sslMode === 'disable' ? false : sslMode !== null || sslEnabledByDefault;
  if (!sslEnabled) return false;
  return {
    rejectUnauthorized: isStrictDatabaseTlsVerification({
      databaseUrl,
      rejectUnauthorizedOverride,
    }),
  };
}

/** URL query parameters that carry TLS settings, which node-postgres would read over `ssl`. */
const SSL_QUERY_PARAMETERS = [
  'ssl',
  'sslmode',
  'sslcert',
  'sslkey',
  'sslrootcert',
  'sslpassword',
  'sslnegotiation',
  'uselibpqcompat',
];

/**
 * The connection URL without its TLS query parameters, for node-postgres.
 *
 * @remarks
 * - **Why:** node-postgres merges the parsed connection string OVER the config object, so a
 *   `sslmode` in the URL would silently replace the `ssl` options derived from it (and from
 *   `DATABASE_SSL_REJECT_UNAUTHORIZED`) — and pg-connection-string treats `require` as
 *   `verify-full`. The TLS decision is made once, from the URL, and passed as `ssl`.
 * - **Failure modes:** none — a URL that does not parse is returned unchanged, so the driver
 *   reports it.
 */
export function withoutSslQueryParameters(databaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    // safe-catch: an unparseable URL goes to the driver as-is, which names the problem.
    return databaseUrl;
  }
  for (const parameter of SSL_QUERY_PARAMETERS) url.searchParams.delete(parameter);
  return url.toString();
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
 *   `pnpm setup:local` share. It only reads the hostname, so `setup:local`'s environment guard
 *   applies it to `REDIS_URL` as well.
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
