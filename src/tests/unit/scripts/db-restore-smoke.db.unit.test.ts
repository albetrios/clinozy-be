import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  findSequencesBehindTheirIds,
  findUnappliedMigrations,
  findUnreadableTables,
  RESTORE_SMOKE_SCHEMA_NAMES,
} from '@/scripts/ops/db-restore-smoke.js';

/**
 * One dedicated connection, so the temporary tables (and the sequences behind their ids) are
 * visible to every statement here and to nothing else: `schemaNames` pins each check to this
 * session's own temporary schema. Every check is read-only — the restored copy is production's data.
 */
describe('restore smoke checks', () => {
  let client: pg.Client;
  let temporarySchemaName: string;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();

    await client.query(
      'CREATE TEMPORARY TABLE restored_rows (id bigserial PRIMARY KEY, note text)',
    );
    await client.query(
      'CREATE TEMPORARY TABLE identity_rows (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY)',
    );
    await client.query('CREATE TEMPORARY TABLE empty_rows (id bigserial PRIMARY KEY)');
    await client.query(
      "INSERT INTO restored_rows (note) SELECT 'restored' FROM generate_series(1, 5)",
    );
    await client.query('INSERT INTO identity_rows DEFAULT VALUES');

    const {
      rows: [temporarySchema],
    } = await client.query<{ name: string }>(
      'SELECT nspname AS name FROM pg_namespace WHERE oid = pg_my_temp_schema()',
    );
    if (!temporarySchema) throw new Error('no temporary schema for this session');
    temporarySchemaName = temporarySchema.name;
  });

  afterAll(async () => {
    await client.end();
  });

  it("covers public and every one of the app's schemas", () => {
    expect(RESTORE_SMOKE_SCHEMA_NAMES).toEqual([
      'public',
      'auth',
      'tenancy',
      'billing',
      'notify',
      'audit',
      'upload',
      'app',
    ]);
  });

  describe('findUnappliedMigrations', () => {
    it('names only the files the ledger has not recorded', async () => {
      // The harness migrated this database, so the baseline is recorded.
      await expect(
        findUnappliedMigrations({
          client,
          migrationFileNames: ['99999999999999_not_applied.sql', '00000000000000_init.sql'],
        }),
      ).resolves.toEqual(['99999999999999_not_applied.sql']);
    });
  });

  describe('findUnreadableTables', () => {
    it('reads every table it may read', async () => {
      await expect(
        findUnreadableTables({ client, schemaNames: [temporarySchemaName] }),
      ).resolves.toEqual([]);
    });

    it('records a refused read with its SQLSTATE and moves on', async () => {
      // The migrations create the application role NOLOGIN; it holds no grant on these tables.
      await client.query('SET ROLE clinozy_be_app');
      try {
        const unreadableTables = await findUnreadableTables({
          client,
          schemaNames: [temporarySchemaName],
        });
        expect(unreadableTables.map((table) => table.errorCode)).toEqual([
          '42501',
          '42501',
          '42501',
        ]);
      } finally {
        await client.query('RESET ROLE');
      }
    });
  });

  describe('findSequencesBehindTheirIds', () => {
    it('passes sequences past their ids, serial and identity alike, and empty tables', async () => {
      await expect(
        findSequencesBehindTheirIds({ client, schemaNames: [temporarySchemaName] }),
      ).resolves.toEqual([]);
    });

    it('names a sequence wound back below an id already in its column', async () => {
      await client.query(
        `SELECT setval(format('%I.restored_rows_id_seq', $1::text)::regclass, 3)`,
        [temporarySchemaName],
      );
      await expect(
        findSequencesBehindTheirIds({ client, schemaNames: [temporarySchemaName] }),
      ).resolves.toEqual([
        {
          sequenceName: `${temporarySchemaName}.restored_rows_id_seq`,
          columnName: `${temporarySchemaName}.restored_rows.id`,
        },
      ]);
    });
  });
});
