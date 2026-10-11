import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { advanceIdSequences, ID_SEQUENCE_RESTORE_GAP } from '@/scripts/ops/db-sequences-advance.js';

/**
 * One dedicated connection, so the temporary tables (and the sequences behind their ids) are
 * visible to every statement here and to nothing else: `schemaNames` pins the pass to this
 * session's own temporary schema, so the shared test database's sequences never move.
 */
describe('advanceIdSequences', () => {
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
      'CREATE TEMPORARY TABLE unused_rows (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY)',
    );
    await client.query('CREATE TEMPORARY TABLE narrow_rows (id serial PRIMARY KEY)');
    await client.query(
      "INSERT INTO restored_rows (note) SELECT 'before the restore' FROM generate_series(1, 5)",
    );
    await client.query('INSERT INTO narrow_rows DEFAULT VALUES');

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

  it('jumps every bigint sequence by the gap and reports each one in name order', async () => {
    const advancedSequences = await advanceIdSequences({
      client,
      schemaNames: [temporarySchemaName],
    });

    expect(advancedSequences).toEqual([
      {
        sequenceName: `${temporarySchemaName}.restored_rows_id_seq`,
        previousValue: 5n,
        advancedValue: 5n + ID_SEQUENCE_RESTORE_GAP,
      },
      {
        // Never used: counts from 0, so the first id after the restore is past the gap too.
        sequenceName: `${temporarySchemaName}.unused_rows_id_seq`,
        previousValue: 0n,
        advancedValue: ID_SEQUENCE_RESTORE_GAP,
      },
    ]);

    const {
      rows: [nextRow],
    } = await client.query<{ id: string }>(
      "INSERT INTO restored_rows (note) VALUES ('after the restore') RETURNING id",
    );
    expect(BigInt(nextRow?.id ?? '0')).toBe(5n + ID_SEQUENCE_RESTORE_GAP + 1n);
  });

  it('leaves a sequence that is not bigint alone', async () => {
    // A 32-bit id has no room for the gap; ids are bigint by convention, so none should exist.
    const {
      rows: [nextRow],
    } = await client.query<{ id: number }>('INSERT INTO narrow_rows DEFAULT VALUES RETURNING id');
    expect(nextRow?.id).toBe(2);
  });
});
