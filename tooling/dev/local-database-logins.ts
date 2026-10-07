import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import { upsertEnvAssignment } from './env-file.util.js';
import {
  DATABASE_URL_KEYS,
  isLocalDatabaseUrl,
} from '@/infrastructure/database/utils/connection-url.util.js';

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
  maintenanceRole: string;
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
      role: roles.maintenanceRole,
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

/**
 * Roles the migrations create that deliberately get no local login — `owner` is the NOLOGIN group
 * owning the tables, and `migrator` only logs in hosted (local migrations run as the compose
 * superuser). With {@link localDatabaseLogins} it must cover every role the migrations create:
 * `local-database-logins.unit.test.ts` fails when a migration adds or renames a role that neither
 * list names, so a future role change is decided here instead of drifting silently.
 */
export function rolesWithoutLocalLogin(sqlStem: string): readonly string[] {
  return [`${sqlStem}_owner`, `${sqlStem}_migrator`];
}

/** Where a planned login's password came from. */
export type PasswordSource = 'env-local' | 'environment' | 'generated';

/** One login with the password to provision and the URL to write. */
export type PlannedLogin = LocalDatabaseLogin & {
  password: string;
  url: string;
  passwordSource: PasswordSource;
};

const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
/** Characters safe inline in a SQL literal and a URL. */
const LOGIN_PASSWORD = /^[A-Za-z0-9_-]+$/;

/** A password for a new login: 48 hex characters (safe in a URL and a SQL literal). */
function generateLoginPassword(): string {
  return randomBytes(24).toString('hex');
}

/** The password `value` carries when it is a URL logging in as `role`, and is safe to reuse. */
export function passwordFromUrl(value: string | undefined, role: string): string | undefined {
  const url = parseUrl(value);
  if (!url || decodeURIComponent(url.username) !== role || !url.password) return undefined;
  const password = decodeURIComponent(url.password);
  return LOGIN_PASSWORD.test(password) ? password : undefined;
}

/**
 * Plans the logins. Each password is the one `.env.local` already has for that role (re-runs keep
 * every connection string stable), else the one the process environment carries for that variable
 * (shell exports, CI or cloud variables), else a new one. Every URL reuses the superuser URL's host,
 * port, database and query (TLS options) with the role's credentials.
 */
export function planLocalDatabaseLogins(options: {
  envLocal: string;
  environment: Readonly<Record<string, string | undefined>>;
  superuserUrl: string;
  logins: readonly LocalDatabaseLogin[];
  newPassword?: () => string;
}): PlannedLogin[] {
  const values = dotenv.parse(options.envLocal);
  const newPassword = options.newPassword ?? generateLoginPassword;
  return options.logins.map((login) => {
    if (!SQL_IDENTIFIER.test(login.role)) throw new Error(`unsafe role name: ${login.role}`);
    const fromEnvLocal = passwordFromUrl(values[login.envKey], login.role);
    const fromEnvironment = passwordFromUrl(options.environment[login.envKey], login.role);
    const [password, passwordSource]: [string, PasswordSource] = fromEnvLocal
      ? [fromEnvLocal, 'env-local']
      : fromEnvironment
        ? [fromEnvironment, 'environment']
        : [newPassword(), 'generated'];
    const url = new URL(options.superuserUrl);
    url.username = login.role;
    url.password = password;
    return { ...login, password, url: url.toString(), passwordSource };
  });
}

/** `ALTER ROLE "<role>" <attributes> PASSWORD '<password>'` — inputs validated, never user text. */
export function alterRoleStatement(login: PlannedLogin): string {
  if (!SQL_IDENTIFIER.test(login.role)) throw new Error(`unsafe role name: ${login.role}`);
  if (!LOGIN_PASSWORD.test(login.password)) throw new Error('unsafe password characters');
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

/** A database URL in the process environment that would take a local session off its logins. */
export type EnvironmentDatabaseUrlProblem = { envKey: string; problem: string };

/**
 * The database URLs the process environment sets that a local session must not use. With
 * `NODE_ENV` unset the loader keeps the environment's value over `.env.local`'s, so a cloud
 * environment given development's Variables would migrate, seed or run maintenance contexts
 * against the hosted database. Allowed: the value `.env.local` itself holds (inherited from a
 * process that loaded it), and a local URL that logs in as the variable's role (its password is
 * adopted — see `planLocalDatabaseLogins`); `DATABASE_MIGRATION_URL` only has to be local.
 * Problems name the user and host, never the password.
 */
export function environmentDatabaseUrlProblems(options: {
  envLocal: string;
  environment: Readonly<Record<string, string | undefined>>;
  logins: readonly LocalDatabaseLogin[];
}): EnvironmentDatabaseUrlProblem[] {
  const envLocalValues = dotenv.parse(options.envLocal);
  const problems: EnvironmentDatabaseUrlProblem[] = [];
  for (const envKey of DATABASE_URL_KEYS) {
    const value = options.environment[envKey];
    if (!value || value === envLocalValues[envKey]) continue;
    const role = options.logins.find((login) => login.envKey === envKey)?.role;
    const url = parseUrl(value);
    const user = url ? decodeURIComponent(url.username) : '';
    if (!isLocalDatabaseUrl(value)) {
      problems.push({
        envKey,
        problem: `points at ${url?.hostname || 'an unparseable URL'}, not the local Postgres`,
      });
    } else if (role && user !== role) {
      problems.push({ envKey, problem: `logs in as ${user || 'no user'}, not ${role}` });
    }
  }
  return problems;
}

function parseUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}
