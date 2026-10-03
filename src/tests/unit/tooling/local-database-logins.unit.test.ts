import { describe, expect, it } from 'vitest';
import dotenv from 'dotenv';
import {
  alterRoleStatement,
  applyLocalDatabaseLogins,
  isLocalDatabaseUrl,
  localDatabaseLogins,
  planLocalDatabaseLogins,
} from '@tooling/dev/local-database-logins.js';

const SUPERUSER_URL = 'postgresql://owner:owner@localhost:5432/appdb';
const LOGINS = localDatabaseLogins({ appRole: 'app_be_app', sqlStem: 'app_be' });

function fixedPasswords() {
  let counter = 0;
  return () => {
    counter += 1;
    return `generated${counter}`;
  };
}

describe('setup:local — the three local database logins', () => {
  it('maps runtime, maintenance and operator to their env variables and attributes', () => {
    expect(LOGINS.map((login) => [login.envKey, login.role, login.attributes])).toEqual([
      ['DATABASE_URL', 'app_be_app', 'LOGIN'],
      ['DATABASE_MAINTENANCE_URL', 'app_be_maintenance', 'LOGIN'],
      ['DATABASE_OPERATOR_URL', 'app_be_operator', 'LOGIN BYPASSRLS'],
    ]);
  });

  it('builds each URL on the superuser host and database with a new password', () => {
    const planned = planLocalDatabaseLogins({
      envLocal: `DATABASE_URL=${SUPERUSER_URL}\n`,
      superuserUrl: SUPERUSER_URL,
      logins: LOGINS,
      newPassword: fixedPasswords(),
    });
    expect(planned.map((login) => login.url)).toEqual([
      'postgresql://app_be_app:generated1@localhost:5432/appdb',
      'postgresql://app_be_maintenance:generated2@localhost:5432/appdb',
      'postgresql://app_be_operator:generated3@localhost:5432/appdb',
    ]);
    expect(planned.every((login) => !login.reused)).toBe(true);
  });

  it('keeps the password already written for a role, so re-runs are idempotent', () => {
    const envLocal = [
      'DATABASE_URL=postgresql://app_be_app:keepme123@localhost:5432/appdb',
      'DATABASE_OPERATOR_URL=postgresql://someone_else:other@localhost:5432/appdb',
    ].join('\n');
    const planned = planLocalDatabaseLogins({
      envLocal,
      superuserUrl: SUPERUSER_URL,
      logins: LOGINS,
      newPassword: fixedPasswords(),
    });
    expect(planned[0]).toMatchObject({ password: 'keepme123', reused: true });
    // A URL for a different user is not this role's password.
    expect(planned[2]).toMatchObject({ role: 'app_be_operator', reused: false });
  });

  it('writes the URLs and pins DATABASE_MIGRATION_URL to the superuser only when it is unset', () => {
    const planned = planLocalDatabaseLogins({
      envLocal: '',
      superuserUrl: SUPERUSER_URL,
      logins: LOGINS,
      newPassword: fixedPasswords(),
    });
    const written = dotenv.parse(
      applyLocalDatabaseLogins({
        envLocal: 'LOG_LEVEL=debug\n',
        superuserUrl: SUPERUSER_URL,
        planned,
      }),
    );
    expect(written).toMatchObject({
      LOG_LEVEL: 'debug',
      DATABASE_URL: planned[0]?.url,
      DATABASE_MAINTENANCE_URL: planned[1]?.url,
      DATABASE_OPERATOR_URL: planned[2]?.url,
      DATABASE_MIGRATION_URL: SUPERUSER_URL,
    });
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
    const [app, , operator] = planLocalDatabaseLogins({
      envLocal: '',
      superuserUrl: SUPERUSER_URL,
      logins: LOGINS,
      newPassword: () => 'abc123',
    });
    expect(alterRoleStatement(app!)).toBe(`ALTER ROLE "app_be_app" LOGIN PASSWORD 'abc123'`);
    expect(alterRoleStatement(operator!)).toBe(
      `ALTER ROLE "app_be_operator" LOGIN BYPASSRLS PASSWORD 'abc123'`,
    );
    expect(() =>
      alterRoleStatement({ ...app!, password: "x'; DROP ROLE app_be_app; --" }),
    ).toThrow();
    expect(() => alterRoleStatement({ ...app!, role: 'App"Role' })).toThrow();
  });

  it('recognises a local database URL', () => {
    expect(isLocalDatabaseUrl('postgresql://u:p@localhost:5432/db')).toBe(true);
    expect(isLocalDatabaseUrl('postgresql://u:p@127.0.0.1:5432/db')).toBe(true);
    expect(isLocalDatabaseUrl('postgresql://u:p@db.example.test:5432/db')).toBe(false);
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
  });
});
