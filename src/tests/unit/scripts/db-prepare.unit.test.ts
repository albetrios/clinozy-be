import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Every statement the fake server received, and every step that ran, in order. */
const calls: string[] = [];
let existingDatabases = new Set<string>();

vi.mock('pg', () => {
  class Client {
    connectionString: string;
    constructor(options: { connectionString: string }) {
      this.connectionString = options.connectionString;
    }
    on() {
      return this;
    }
    async connect() {
      calls.push(`connect ${new URL(this.connectionString).pathname}`);
    }
    escapeIdentifier(name: string) {
      return `"${name}"`;
    }
    async query(text: string, values?: string[]) {
      calls.push(values ? `${text} [${values.join(',')}]` : text);
      if (text.startsWith('SELECT 1 FROM pg_database')) {
        return { rowCount: existingDatabases.has(values?.[0] ?? '') ? 1 : 0 };
      }
      return { rowCount: 0 };
    }
    async end() {}
  }
  return { default: { Client } };
});

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => {
    calls.push('migrate');
    return { status: 0, stdout: '', stderr: '' };
  }),
}));

vi.mock('@tooling/dev/local-database-logins.js', () => ({
  enableLocalDatabaseLogins: vi.fn(async () => {
    calls.push('logins');
    return { status: 'done', detail: 'ok', urls: { DATABASE_URL: 'postgresql://app@localhost/x' } };
  }),
}));

vi.mock('@/scripts/seed/seed-runtime-url.js', () => ({}));
vi.mock('@/infrastructure/database/connection.js', () => ({
  closeDatabase: vi.fn(async () => {
    calls.push('close pool');
  }),
}));
vi.mock('@/domains/tenancy/sub-domains/permission/seed/permission.reference.seed.js', () => ({
  seedPermissions: vi.fn(async () => {
    calls.push('seed permissions');
  }),
}));
vi.mock('@/scripts/seed/minimal.js', () => ({
  runMinimalSeed: vi.fn(async () => {
    calls.push('seed minimal');
  }),
}));
vi.mock('@/scripts/seed/full.js', () => ({
  runFullSeed: vi.fn(async () => {
    calls.push('seed full');
  }),
}));

const { prepareDatabase } = await import('@/scripts/ops/db-prepare.js');

const SAVED_KEYS = ['DATABASE_URL', 'DATABASE_MIGRATION_URL'] as const;

/**
 * Locks in the one way a database is set up (`src/scripts/ops/db-prepare.ts`): create → migrate →
 * logins → seed → worker databases, each step only when its options and the database ask for it,
 * and never a create or a drop on a server that is not local.
 */
describe('prepareDatabase', () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    calls.length = 0;
    existingDatabases = new Set();
    for (const key of SAVED_KEYS) saved.set(key, process.env[key]);
    delete process.env.DATABASE_URL;
    process.env.DATABASE_MIGRATION_URL = 'postgresql://owner:owner@localhost:5432/app_database';
  });

  afterEach(() => {
    for (const key of SAVED_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('runs every step in order: create, migrate, logins, seed, worker databases', async () => {
    await prepareDatabase({ seed: 'full', enableLocalLogins: true, workerDatabases: 2 });
    expect(calls).toEqual([
      'connect /postgres',
      'SELECT 1 FROM pg_database WHERE datname = $1 [app_database]',
      'CREATE DATABASE "app_database"',
      'migrate',
      'logins',
      'seed full',
      'close pool',
      'connect /postgres',
      'DROP DATABASE IF EXISTS "app_database_worker_1" WITH (FORCE)',
      'CREATE DATABASE "app_database_worker_1" TEMPLATE "app_database"',
      'DROP DATABASE IF EXISTS "app_database_worker_2" WITH (FORCE)',
      'CREATE DATABASE "app_database_worker_2" TEMPLATE "app_database"',
    ]);
  });

  it('keeps an existing database, and drops it first only under reset', async () => {
    existingDatabases.add('app_database');
    await prepareDatabase({ seed: 'none', enableLocalLogins: false });
    expect(calls).toEqual([
      'connect /postgres',
      'SELECT 1 FROM pg_database WHERE datname = $1 [app_database]',
      'migrate',
    ]);

    calls.length = 0;
    existingDatabases.clear();
    await prepareDatabase({ seed: 'none', reset: true, enableLocalLogins: false });
    expect(calls.slice(0, 3)).toEqual([
      'connect /postgres',
      'DROP DATABASE IF EXISTS "app_database" WITH (FORCE)',
      'SELECT 1 FROM pg_database WHERE datname = $1 [app_database]',
    ]);
  });

  it('never creates or drops a database on a server that is not local', async () => {
    process.env.DATABASE_MIGRATION_URL = 'postgresql://owner:secret@db.example.com:5432/production';
    await prepareDatabase({ seed: 'minimal', reset: true, enableLocalLogins: false });
    expect(calls).toEqual(['migrate', 'seed minimal', 'close pool']);
    // From the sources the runner starts through tsx; from dist/ it is the compiled migrate.js.
    const childProcess = await import('node:child_process');
    expect(vi.mocked(childProcess.spawnSync).mock.calls.at(-1)?.slice(0, 2)).toEqual([
      'pnpm',
      ['exec', 'tsx', 'src/infrastructure/database/migration/migrate.ts'],
    ]);
  });

  it('seeds the permission catalog only for the test harness level', async () => {
    existingDatabases.add('app_database');
    await prepareDatabase({ seed: 'permissions', enableLocalLogins: false });
    expect(calls.slice(-2)).toEqual(['seed permissions', 'close pool']);
  });

  it('points the process at the logins it turned on, so the seed connects the way the app will', async () => {
    existingDatabases.add('app_database');
    await prepareDatabase({ seed: 'none', enableLocalLogins: true });
    expect(process.env.DATABASE_URL).toBe('postgresql://app@localhost/x');
  });

  it('names the failing step', async () => {
    const childProcess = await import('node:child_process');
    vi.mocked(childProcess.spawnSync).mockReturnValueOnce({
      status: 1,
      stdout: 'applied 3',
      stderr: 'relation exists',
    } as never);
    existingDatabases.add('app_database');
    await expect(
      prepareDatabase({ seed: 'none', enableLocalLogins: false, migrationOutput: 'pipe' }),
    ).rejects.toThrow(/^migrate: migrations failed \(exit 1\)\napplied 3relation exists/);
  });
});
