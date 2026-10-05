import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';
import {
  assertConnectedToTestDatabase,
  buildMigrationChildEnvironment,
  isHarnessOnProvidedDatabase,
  LOCAL_TEST_DATABASE_NAME,
  LOCAL_TEST_DATABASE_URL,
  pointHarnessAtLocalTestDatabase,
} from '@/tests/helpers/local-test-database.js';

const MANAGED_KEYS = [
  'DATABASE_URL',
  'DATABASE_MIGRATION_URL',
  'DATABASE_MAINTENANCE_URL',
  'DATABASE_OPERATOR_URL',
  'GITHUB_ACTIONS',
  'ALLOW_HOSTED_TEST_DATABASE',
  'CI',
] as const;

/** A postgres.js tagged-template stand-in answering `current_database()` with `databaseName`. */
function fakeQuery(databaseName: string) {
  const query = vi.fn(async () => [{ name: databaseName }]);
  return { query, sql: query as unknown as ReturnType<typeof postgres> };
}

describe('local test database harness', () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of MANAGED_KEYS) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of MANAGED_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  describe('isHarnessOnProvidedDatabase', () => {
    it('is true on a GitHub Actions runner and with the explicit hosted-database opt-in', () => {
      process.env.GITHUB_ACTIONS = 'true';
      expect(isHarnessOnProvidedDatabase()).toBe(true);
      delete process.env.GITHUB_ACTIONS;
      process.env.ALLOW_HOSTED_TEST_DATABASE = 'true';
      expect(isHarnessOnProvidedDatabase()).toBe(true);
    });

    it('ignores CI=true, which developer shells export for unrelated tools', () => {
      process.env.CI = 'true';
      expect(isHarnessOnProvidedDatabase()).toBe(false);
    });
  });

  describe('pointHarnessAtLocalTestDatabase', () => {
    it('runs on the local operator login, renamed to the test database', () => {
      process.env.DATABASE_URL = 'postgresql://app_login@localhost:5432/devdb';
      process.env.DATABASE_OPERATOR_URL = 'postgresql://operator_login@localhost:5432/devdb';

      pointHarnessAtLocalTestDatabase();

      expect(process.env.DATABASE_URL).toBe(
        `postgresql://operator_login@localhost:5432/${LOCAL_TEST_DATABASE_NAME}`,
      );
      expect(process.env.DATABASE_OPERATOR_URL).toBe(process.env.DATABASE_URL);
      expect(new URL(String(process.env.DATABASE_MIGRATION_URL)).pathname).toBe(
        `/${LOCAL_TEST_DATABASE_NAME}`,
      );
    });

    it('never keeps a remote URL: required ones fall back to the local test database, optional ones are dropped', () => {
      process.env.DATABASE_URL = 'postgresql://app_login@db.example.com:5432/devdb';
      process.env.DATABASE_MIGRATION_URL = 'postgresql://owner_login@db.example.com:5432/devdb';
      process.env.DATABASE_MAINTENANCE_URL = 'postgresql://maintenance@db.example.com:5432/devdb';
      process.env.DATABASE_OPERATOR_URL = 'postgresql://operator@db.example.com:5432/devdb';

      pointHarnessAtLocalTestDatabase();

      expect(process.env.DATABASE_URL).toBe(LOCAL_TEST_DATABASE_URL);
      expect(process.env.DATABASE_MIGRATION_URL).toBe(LOCAL_TEST_DATABASE_URL);
      expect(process.env.DATABASE_MAINTENANCE_URL).toBeUndefined();
      expect(process.env.DATABASE_OPERATOR_URL).toBeUndefined();
    });

    it('drops a remote maintenance login even when the main login is local', () => {
      process.env.DATABASE_URL = 'postgresql://app_login@127.0.0.1:5432/devdb';
      process.env.DATABASE_MAINTENANCE_URL = 'postgresql://maintenance@db.example.com:5432/devdb';

      pointHarnessAtLocalTestDatabase();

      expect(process.env.DATABASE_URL).toBe(
        `postgresql://app_login@127.0.0.1:5432/${LOCAL_TEST_DATABASE_NAME}`,
      );
      expect(process.env.DATABASE_MAINTENANCE_URL).toBeUndefined();
    });

    it('leaves a provided database alone', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.DATABASE_URL = 'postgresql://runner@localhost:5432/ci_database';

      pointHarnessAtLocalTestDatabase();

      expect(process.env.DATABASE_URL).toBe('postgresql://runner@localhost:5432/ci_database');
    });
  });

  describe('assertConnectedToTestDatabase', () => {
    it('passes on the local test database', async () => {
      const { sql } = fakeQuery(LOCAL_TEST_DATABASE_NAME);
      await expect(assertConnectedToTestDatabase(sql)).resolves.toBeUndefined();
    });

    it('refuses any other database, naming it', async () => {
      const { sql } = fakeQuery('devdb');
      await expect(assertConnectedToTestDatabase(sql)).rejects.toThrow(
        /Refusing to wipe database "devdb"/,
      );
    });

    it('does not even ask on a provided database', async () => {
      process.env.GITHUB_ACTIONS = 'true';
      const { query, sql } = fakeQuery('ci_database');
      await assertConnectedToTestDatabase(sql);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('buildMigrationChildEnvironment', () => {
    it('runs the migration child as NODE_ENV=local so the machine-local env file cannot override the test URLs', () => {
      expect(buildMigrationChildEnvironment().NODE_ENV).toBe('local');
    });

    it('passes the environment through unchanged on a provided database', () => {
      process.env.GITHUB_ACTIONS = 'true';
      expect(buildMigrationChildEnvironment()).toBe(process.env);
    });
  });
});
