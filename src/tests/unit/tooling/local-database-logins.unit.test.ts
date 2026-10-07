import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';
import {
  alterRoleStatement,
  applyLocalDatabaseLogins,
  environmentConnectionUrlProblems,
  localDatabaseLogins,
  passwordFromUrl,
  planLocalDatabaseLogins,
  rolesWithoutLocalLogin,
} from '@tooling/dev/local-database-logins.js';
import { loadConfig } from '@tooling/setup/common/config.js';
import {
  resolveDerivedNames,
  resolveSqlIdentifierStem,
} from '@tooling/setup/codegen/project-identity.util.js';

const SUPERUSER_URL = 'postgresql://owner:owner@localhost:5432/appdb';
const LOGINS = localDatabaseLogins({
  appRole: 'app_be_app',
  maintenanceRole: 'app_be_maintenance',
  sqlStem: 'app_be',
});

function fixedPasswords() {
  let counter = 0;
  return () => {
    counter += 1;
    return `generated${counter}`;
  };
}

function plan(envLocal = '', environment: Record<string, string | undefined> = {}) {
  return planLocalDatabaseLogins({
    envLocal,
    environment,
    superuserUrl: SUPERUSER_URL,
    logins: LOGINS,
    newPassword: fixedPasswords(),
  });
}

describe('setup:local — the local database logins', () => {
  it('maps runtime, maintenance and operator to their env variables and attributes', () => {
    expect(LOGINS.map((login) => [login.envKey, login.role, login.attributes])).toEqual([
      ['DATABASE_URL', 'app_be_app', 'LOGIN'],
      ['DATABASE_MAINTENANCE_URL', 'app_be_maintenance', 'LOGIN'],
      ['DATABASE_OPERATOR_URL', 'app_be_operator', 'LOGIN BYPASSRLS'],
    ]);
  });

  it('takes each password from .env.local, else the process environment, else generates one', () => {
    const planned = plan('DATABASE_URL=postgresql://app_be_app:fromLocal@localhost:5432/appdb\n', {
      // The same variable in the environment: .env.local still wins (stable connection strings).
      DATABASE_URL: 'postgresql://app_be_app:fromEnvironment@localhost:5432/appdb',
      DATABASE_MAINTENANCE_URL:
        'postgresql://app_be_maintenance:fromEnvironment@localhost:5432/appdb',
      // A URL for some other user is not this role's password.
      DATABASE_OPERATOR_URL: 'postgresql://somebody:else@localhost:5432/appdb',
    });
    expect(planned.map((login) => [login.role, login.password, login.passwordSource])).toEqual([
      ['app_be_app', 'fromLocal', 'env-local'],
      ['app_be_maintenance', 'fromEnvironment', 'environment'],
      ['app_be_operator', 'generated1', 'generated'],
    ]);
    expect(planned[2]?.url).toBe('postgresql://app_be_operator:generated1@localhost:5432/appdb');
  });

  it('only reuses a password that is safe inline in SQL and in a URL', () => {
    expect(passwordFromUrl('postgresql://r:ok-Pass_123@h/db', 'r')).toBe('ok-Pass_123');
    expect(passwordFromUrl("postgresql://r:bad'quote@h/db", 'r')).toBeUndefined();
    expect(passwordFromUrl('postgresql://other:ok@h/db', 'r')).toBeUndefined();
  });

  it('writes the URLs and pins DATABASE_MIGRATION_URL to the superuser only when it is unset', () => {
    const planned = plan();
    const written = dotenv.parse(
      applyLocalDatabaseLogins({
        envLocal: 'LOG_LEVEL=debug\n',
        superuserUrl: SUPERUSER_URL,
        planned,
      }),
    );
    expect(written.LOG_LEVEL).toBe('debug');
    for (const login of planned) expect(written[login.envKey]).toBe(login.url);
    expect(written.DATABASE_MIGRATION_URL).toBe(SUPERUSER_URL);
    const keepsMigration = dotenv.parse(
      applyLocalDatabaseLogins({
        envLocal: 'DATABASE_MIGRATION_URL=postgresql://migrator:x@localhost:5432/appdb\n',
        superuserUrl: SUPERUSER_URL,
        planned,
      }),
    );
    expect(keepsMigration.DATABASE_MIGRATION_URL).toBe(
      'postgresql://migrator:x@localhost:5432/appdb',
    );
  });

  it('emits an ALTER ROLE with validated identifiers only', () => {
    const [app, , operator] = plan();
    expect(alterRoleStatement(app!)).toBe(`ALTER ROLE "app_be_app" LOGIN PASSWORD 'generated1'`);
    expect(alterRoleStatement(operator!)).toBe(
      `ALTER ROLE "app_be_operator" LOGIN BYPASSRLS PASSWORD 'generated3'`,
    );
    expect(() =>
      alterRoleStatement({ ...app!, password: "x'; DROP ROLE app_be_app; --" }),
    ).toThrow();
    expect(() => alterRoleStatement({ ...app!, role: 'App"Role' })).toThrow();
  });
});

describe('setup:local — database and Redis URLs in the process environment', () => {
  const problems = (environment: Record<string, string | undefined>, envLocal = '') =>
    environmentConnectionUrlProblems({ envLocal, environment, logins: LOGINS });

  it('accepts nothing set, and local URLs that log in as the role of each variable', () => {
    expect(problems({})).toEqual([]);
    expect(
      problems({
        DATABASE_URL: 'postgresql://app_be_app:secret@localhost:5432/appdb',
        DATABASE_MAINTENANCE_URL: 'postgresql://app_be_maintenance:secret@127.0.0.1:5432/appdb',
        DATABASE_OPERATOR_URL: 'postgresql://app_be_operator:secret@localhost:5432/appdb',
        // The migration URL only has to be local: locally it is the compose superuser.
        DATABASE_MIGRATION_URL: SUPERUSER_URL,
      }),
    ).toEqual([]);
  });

  it('rejects a hosted URL, naming the host but never the password', () => {
    const found = problems({
      DATABASE_MAINTENANCE_URL:
        'postgresql://app_be_maintenance:hosted-secret@ep-dev.neon.tech/appdb?sslmode=verify-full',
      DATABASE_MIGRATION_URL: 'postgresql://app_be_migrator:hosted-secret@ep-dev.neon.tech/appdb',
    });
    expect(found).toEqual([
      {
        envKey: 'DATABASE_MIGRATION_URL',
        problem: 'points at ep-dev.neon.tech, not the local Postgres',
      },
      {
        envKey: 'DATABASE_MAINTENANCE_URL',
        problem: 'points at ep-dev.neon.tech, not the local Postgres',
      },
    ]);
    expect(JSON.stringify(found)).not.toContain('hosted-secret');
  });

  it('rejects a local URL that logs in as another role, such as the superuser', () => {
    expect(problems({ DATABASE_URL: SUPERUSER_URL })).toEqual([
      { envKey: 'DATABASE_URL', problem: 'logs in as owner, not app_be_app' },
    ]);
    expect(problems({ DATABASE_OPERATOR_URL: 'not a url' })).toEqual([
      {
        envKey: 'DATABASE_OPERATOR_URL',
        problem: 'points at an unparseable URL, not the local Postgres',
      },
    ]);
  });

  it('accepts the value .env.local itself holds, inherited from a process that loaded it', () => {
    // verify:base and `set -a; source .env.local` hand the file's own values to children; before
    // the logins exist that is the superuser, which is not an override.
    expect(problems({ DATABASE_URL: SUPERUSER_URL }, `DATABASE_URL=${SUPERUSER_URL}\n`)).toEqual(
      [],
    );
  });

  it('holds REDIS_URL to the local Redis: hosted is rejected, local or the file value passes', () => {
    expect(problems({ REDIS_URL: 'redis://localhost:6379' })).toEqual([]);
    expect(problems({ REDIS_URL: 'redis://127.0.0.1:6379/1' })).toEqual([]);
    const hosted = 'rediss://default:hosted-secret@redis-dev.example.cloud:6380';
    const found = problems({ REDIS_URL: hosted });
    expect(found).toEqual([
      { envKey: 'REDIS_URL', problem: 'points at redis-dev.example.cloud, not the local Redis' },
    ]);
    expect(JSON.stringify(found)).not.toContain('hosted-secret');
    // A developer who points .env.local itself at a hosted Redis is not overridden by it.
    expect(problems({ REDIS_URL: hosted }, `REDIS_URL=${hosted}\n`)).toEqual([]);
  });
});

describe('local database logins stay in step with the migrations', () => {
  // The migrations own the roles. Every role they create must be either a local login or
  // deliberately login-less — a new or renamed role fails here until it is mapped.
  it('covers exactly the roles the migrations create', () => {
    const config = loadConfig();
    const sqlStem = resolveSqlIdentifierStem(config);
    const { databaseAppRole, databaseMaintenanceRole } = resolveDerivedNames(config);
    const migrationsDirectory = join(process.cwd(), 'migrations');
    const createdRoles = new Set<string>();
    for (const file of readdirSync(migrationsDirectory).filter((name) => name.endsWith('.sql'))) {
      const sql = readFileSync(join(migrationsDirectory, file), 'utf8');
      for (const match of sql.matchAll(/CREATE\s+ROLE\s+"?([a-z_][a-z0-9_]*)"?/gi)) {
        createdRoles.add(match[1]!);
      }
    }
    const declared = [
      ...localDatabaseLogins({
        appRole: databaseAppRole,
        maintenanceRole: databaseMaintenanceRole,
        sqlStem,
      }).map((login) => login.role),
      ...rolesWithoutLocalLogin(sqlStem),
    ];
    expect(createdRoles.size).toBeGreaterThan(0);
    expect([...createdRoles].sort()).toEqual([...declared].sort());
  });
});
