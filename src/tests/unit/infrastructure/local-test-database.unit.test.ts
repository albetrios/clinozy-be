import { availableParallelism } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertConnectedToTestDatabase,
  buildMigrationChildEnvironment,
  isHarnessOnProvidedDatabase,
  LOCAL_TEST_DATABASE_NAME,
  LOCAL_TEST_DATABASE_URL,
  pointHarnessAtLocalTestDatabase,
  pointWorkerAtItsOwnDatabase,
  testRedisKeyPrefix,
} from '@/tests/helpers/local-test-database.js';
import {
  databaseProjectParallelism,
  isCoverageRun,
  workerDatabaseCount,
  workerDatabaseName,
} from '@tooling/vitest/worker-databases.js';

const MANAGED_KEYS = [
  'DATABASE_URL',
  'DATABASE_MIGRATION_URL',
  'DATABASE_MAINTENANCE_URL',
  'DATABASE_OPERATOR_URL',
  'GITHUB_ACTIONS',
  'ALLOW_HOSTED_TEST_DATABASE',
  'CI',
  'VITEST_POOL_ID',
] as const;

/** A Drizzle `execute` stand-in answering `current_database()` with `databaseName`. */
function fakeQuery(databaseName: string) {
  const query = vi.fn(async () => ({ rows: [{ name: databaseName }] }));
  return {
    query,
    sql: { execute: query } as unknown as Parameters<typeof assertConnectedToTestDatabase>[0],
  };
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

    it('never keeps a remote URL: required ones fall back to the local test database, the optional operator is dropped', () => {
      process.env.DATABASE_URL = 'postgresql://app_login@db.example.com:5432/devdb';
      process.env.DATABASE_MIGRATION_URL = 'postgresql://owner_login@db.example.com:5432/devdb';
      process.env.DATABASE_MAINTENANCE_URL = 'postgresql://maintenance@db.example.com:5432/devdb';
      process.env.DATABASE_OPERATOR_URL = 'postgresql://operator@db.example.com:5432/devdb';

      pointHarnessAtLocalTestDatabase();

      expect(process.env.DATABASE_URL).toBe(LOCAL_TEST_DATABASE_URL);
      expect(process.env.DATABASE_MIGRATION_URL).toBe(LOCAL_TEST_DATABASE_URL);
      expect(process.env.DATABASE_MAINTENANCE_URL).toBe(LOCAL_TEST_DATABASE_URL);
      expect(process.env.DATABASE_OPERATOR_URL).toBeUndefined();
    });

    it('replaces a remote maintenance login even when the main login is local', () => {
      process.env.DATABASE_URL = 'postgresql://app_login@127.0.0.1:5432/devdb';
      process.env.DATABASE_MAINTENANCE_URL = 'postgresql://maintenance@db.example.com:5432/devdb';

      pointHarnessAtLocalTestDatabase();

      expect(process.env.DATABASE_URL).toBe(
        `postgresql://app_login@127.0.0.1:5432/${LOCAL_TEST_DATABASE_NAME}`,
      );
      expect(process.env.DATABASE_MAINTENANCE_URL).toBe(LOCAL_TEST_DATABASE_URL);
    });

    it('leaves a provided database alone', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.DATABASE_URL = 'postgresql://runner@localhost:5432/ci_database';

      pointHarnessAtLocalTestDatabase();

      expect(process.env.DATABASE_URL).toBe('postgresql://runner@localhost:5432/ci_database');
    });
  });

  describe('assertConnectedToTestDatabase', () => {
    it("passes on a worker's own clone of the local test database", async () => {
      const { sql } = fakeQuery(`${LOCAL_TEST_DATABASE_NAME}_worker_1`);
      await expect(assertConnectedToTestDatabase(sql)).resolves.toBeUndefined();
    });

    it('refuses the test database itself: it is only the template', async () => {
      const { sql } = fakeQuery(LOCAL_TEST_DATABASE_NAME);
      await expect(assertConnectedToTestDatabase(sql)).rejects.toThrow(/Refusing to wipe/);
    });

    it('refuses any other database, naming it', async () => {
      const { sql } = fakeQuery('devdb');
      await expect(assertConnectedToTestDatabase(sql)).rejects.toThrow(
        /Refusing to wipe database "devdb"/,
      );
    });

    it("does not even ask on a GitHub Actions runner's own service container", async () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.DATABASE_URL = 'postgresql://ci:ci@localhost:5432/ci_database';
      const { query, sql } = fakeQuery('ci_database');
      await assertConnectedToTestDatabase(sql);
      expect(query).not.toHaveBeenCalled();
    });

    it('refuses a runner whose database is off the runner, naming only the env variable', async () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.DATABASE_URL = 'postgresql://ci:ci@localhost:5432/ci_database';
      process.env.DATABASE_MAINTENANCE_URL =
        'postgresql://owner:secret@ep-restore-drill.neon.tech/production';
      const { query, sql } = fakeQuery('production');
      const refusal = assertConnectedToTestDatabase(sql);
      await expect(refusal).rejects.toThrow(/Refusing to wipe: DATABASE_MAINTENANCE_URL/);
      await expect(refusal).rejects.not.toThrow(/neon\.tech|secret/);
      expect(query).not.toHaveBeenCalled();
    });

    it('passes a hosted database only with the explicit opt-in', async () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.DATABASE_URL = 'postgresql://test:test@hosted-test.example.com/test';
      process.env.ALLOW_HOSTED_TEST_DATABASE = 'true';
      const { query, sql } = fakeQuery('test');
      await assertConnectedToTestDatabase(sql);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('worker databases', () => {
    it('points each worker at its own clone and Redis namespace, logins kept', () => {
      process.env.VITEST_POOL_ID = '3';
      process.env.DATABASE_URL = LOCAL_TEST_DATABASE_URL;
      process.env.DATABASE_OPERATOR_URL = `postgresql://operator:secret@localhost:5432/${LOCAL_TEST_DATABASE_NAME}`;
      pointWorkerAtItsOwnDatabase();
      expect(new URL(process.env.DATABASE_URL).pathname).toBe(
        `/${workerDatabaseName({ database: LOCAL_TEST_DATABASE_NAME, worker: '3' })}`,
      );
      const operator = new URL(process.env.DATABASE_OPERATOR_URL ?? '');
      expect(operator.username).toBe('operator');
      expect(operator.pathname).toBe(`/${LOCAL_TEST_DATABASE_NAME}_worker_3`);
      expect(testRedisKeyPrefix('clinozy')).toBe('clinozy:worker-3:test:');
    });

    it('points a CI worker at its clone of the service container database too', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.VITEST_POOL_ID = '2';
      process.env.DATABASE_URL = 'postgresql://ci:ci@localhost:5432/ci_database';
      pointWorkerAtItsOwnDatabase();
      expect(new URL(process.env.DATABASE_URL).pathname).toBe('/ci_database_worker_2');
    });

    it('lets the wipe guard accept exactly a worker clone of the test database', async () => {
      await expect(
        assertConnectedToTestDatabase(fakeQuery(`${LOCAL_TEST_DATABASE_NAME}_worker_12`).sql),
      ).resolves.toBeUndefined();
      for (const name of [
        `${LOCAL_TEST_DATABASE_NAME}_worker_`,
        `${LOCAL_TEST_DATABASE_NAME}_worker_1x`,
        'clinozy_be_worker_1',
        `dev_${LOCAL_TEST_DATABASE_NAME}_worker_1`,
      ]) {
        await expect(assertConnectedToTestDatabase(fakeQuery(name).sql)).rejects.toThrow(
          /Refusing to wipe/,
        );
      }
    });

    it('refuses to run outside a Vitest worker', () => {
      process.env.DATABASE_URL = LOCAL_TEST_DATABASE_URL;
      expect(() => pointWorkerAtItsOwnDatabase()).toThrow(/VITEST_POOL_ID/);
      expect(() => testRedisKeyPrefix('clinozy')).toThrow(/VITEST_POOL_ID/);
    });

    it('runs e2e and integration files in parallel, one per core up to 4, and one at a time under coverage', () => {
      expect(databaseProjectParallelism(['node', 'vitest', 'run'])).toEqual({
        fileParallelism: true,
        maxWorkers: Math.min(4, availableParallelism()),
      });
      for (const flag of ['--coverage', '--coverage.enabled', '--coverage.enabled=true']) {
        expect(isCoverageRun(['node', 'vitest', 'run', flag])).toBe(true);
        expect(databaseProjectParallelism(['node', 'vitest', 'run', flag])).toEqual({
          fileParallelism: false,
          maxWorkers: 1,
        });
      }
    });

    it('makes a worker database for every pool slot the run can use', () => {
      expect(workerDatabaseCount({ projectMaxWorkers: [1, undefined, '50%'] })).toBe(
        availableParallelism(),
      );
      const more = availableParallelism() + 3;
      expect(workerDatabaseCount({ maxWorkers: more, projectMaxWorkers: [1] })).toBe(more);
      expect(workerDatabaseCount({ projectMaxWorkers: [more, 4] })).toBe(more);
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
