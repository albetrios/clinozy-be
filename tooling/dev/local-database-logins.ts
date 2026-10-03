import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import { upsertEnvAssignment } from './env-file.util.js';

/**
 * One database login `.env.local` connects as — a role the migrations create `NOLOGIN` and local
 * provisioning (`pnpm setup:local`) turns on, mirroring how CI's RLS-parity job and the hosted
 * environments connect (docs/deployment/runbooks/maintenance-database-role.md).
 */
export type LocalDatabaseLogin = {
  role: string;
  /** The env variable whose URL connects as this role. */
  envKey: string;
  /** Role attributes granted on top of the migrations' `NOLOGIN` definition. */
  attributes: 'LOGIN' | 'LOGIN BYPASSRLS';
  purpose: string;
};

/**
 * The three logins: the runtime (`DATABASE_URL`, RLS-subject — production parity), maintenance
 * contexts (`DATABASE_MAINTENANCE_URL`, RLS-subject), and the operator (`DATABASE_OPERATOR_URL`,
 * BYPASSRLS — the test harness and full/bulk seeds switch to it automatically; local/CI only).
 *
 * @remarks
 * `DATABASE_MIGRATION_URL` stays the compose superuser: migrations create roles, and the
 * SECURITY DEFINER functions they define are owned by the migrating role — a role without
 * BYPASSRLS there would make every resolver return zero rows under FORCE RLS.
 */
export function localDatabaseLogins(roles: {
  appRole: string;
  sqlStem: string;
}): readonly LocalDatabaseLogin[] {
  return [
    {
      role: roles.appRole,
      envKey: 'DATABASE_URL',
      attributes: 'LOGIN',
      purpose: 'runtime — row-level security enforced, like production',
    },
    {
      role: `${roles.sqlStem}_maintenance`,
      envKey: 'DATABASE_MAINTENANCE_URL',
      attributes: 'LOGIN',
      purpose: 'maintenance (bypass) contexts — row-level security enforced',
    },
    {
      role: `${roles.sqlStem}_operator`,
      envKey: 'DATABASE_OPERATOR_URL',
      attributes: 'LOGIN BYPASSRLS',
      purpose: 'test harness and full/bulk seeds — local only, never hosted',
    },
  ];
}

/** One login with the password to provision and the URL to write. */
export type PlannedLogin = LocalDatabaseLogin & {
  password: string;
  url: string;
  /** `true` when the password was kept from the URL `.env.local` already has for this role. */
  reused: boolean;
};

const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const GENERATED_PASSWORD = /^[A-Za-z0-9]+$/;

/** A password for a new login: 48 hex characters (safe in a URL and a SQL literal). */
export function generateLoginPassword(): string {
  return randomBytes(24).toString('hex');
}

/**
 * Plans the logins: each keeps the password of the URL `.env.local` already holds for that role (so
 * re-runs are idempotent), otherwise gets a new one; every URL reuses the superuser URL's host,
 * port, database and query (TLS options) with the role's credentials.
 */
export function planLocalDatabaseLogins(options: {
  envLocal: string;
  superuserUrl: string;
  logins: readonly LocalDatabaseLogin[];
  newPassword?: () => string;
}): PlannedLogin[] {
  const values = dotenv.parse(options.envLocal);
  const newPassword = options.newPassword ?? generateLoginPassword;
  return options.logins.map((login) => {
    if (!SQL_IDENTIFIER.test(login.role)) throw new Error(`unsafe role name: ${login.role}`);
    const existing = parseUrl(values[login.envKey]);
    const kept =
      existing && decodeURIComponent(existing.username) === login.role && existing.password
        ? decodeURIComponent(existing.password)
        : undefined;
    const password = kept !== undefined && GENERATED_PASSWORD.test(kept) ? kept : newPassword();
    const url = new URL(options.superuserUrl);
    url.username = login.role;
    url.password = password;
    return { ...login, password, url: url.toString(), reused: password === kept };
  });
}

/** `ALTER ROLE "<role>" <attributes> PASSWORD '<password>'` — inputs validated, never user text. */
export function alterRoleStatement(login: PlannedLogin): string {
  if (!SQL_IDENTIFIER.test(login.role)) throw new Error(`unsafe role name: ${login.role}`);
  if (!GENERATED_PASSWORD.test(login.password)) throw new Error('unsafe password characters');
  return `ALTER ROLE "${login.role}" ${login.attributes} PASSWORD '${login.password}'`;
}

/**
 * Writes the planned URLs into `.env.local` contents, and pins `DATABASE_MIGRATION_URL` to the
 * superuser when it is unset — migrations must not fall back to the RLS-subject runtime login.
 */
export function applyLocalDatabaseLogins(options: {
  envLocal: string;
  superuserUrl: string;
  planned: readonly PlannedLogin[];
}): string {
  let content = options.envLocal;
  for (const login of options.planned)
    content = upsertEnvAssignment(content, login.envKey, login.url);
  if (!dotenv.parse(content).DATABASE_MIGRATION_URL?.trim()) {
    content = upsertEnvAssignment(content, 'DATABASE_MIGRATION_URL', options.superuserUrl);
  }
  return content;
}

/** Whether a database URL points at this machine. */
export function isLocalDatabaseUrl(value: string | undefined): boolean {
  const url = parseUrl(value);
  return url !== undefined && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
}

function parseUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}
