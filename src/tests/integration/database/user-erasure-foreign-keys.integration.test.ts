import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { is, sql } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { database } from '@/infrastructure/database/connection.js';

/** Rows of a `database.execute()` result. */
function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : ((result as { rows?: T[] }).rows ?? []);
}

/**
 * The one reference to `auth.users` that may keep NO ACTION: the owner of a team organization.
 * A user who owns a team organization cannot be deleted until ownership is transferred, and the
 * personal organization is tombstoned together with its owner (see the header of
 * `20261101100000_user_erasure_attribution_set_null.sql`).
 */
const OWNER_REFERENCE = 'tenancy.organizations.owner_user_id';

/**
 * Account erasure policy (G2-2).
 *
 * The tombstone purge deletes a user row after the retention window. Every foreign key that
 * references `auth.users` must therefore either clear (`SET NULL`: attribution, the record outlives
 * the person) or cascade (`CASCADE`: the row belongs to the person). A NO ACTION or RESTRICT
 * reference blocks the purge, the retention job skips the row, and the account is kept forever.
 * The owner column is the single deliberate exception.
 *
 * Two invariants, asserted against the migrated catalog and the Drizzle declarations:
 * 1. The database: every foreign key to `auth.users` outside the owner column clears or cascades.
 * 2. The schema: every `.references(() => users.id)` declares the same action, so a schema-driven
 *    migration cannot silently restore NO ACTION.
 */
describe('Integration: user erasure foreign keys', () => {
  it('clears or cascades every foreign key to auth.users except the owner column', async () => {
    const references = rowsOf<{ reference: string; delete_action: string }>(
      await database.execute(sql`
      SELECT c.conrelid::regclass::text || '.' || a.attname AS reference,
             c.confdeltype::text AS delete_action
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass
    `),
    );
    // Guard against a vacuous pass on an unmigrated database (152 at migration head).
    expect(references.length).toBeGreaterThan(100);

    // n = SET NULL, c = CASCADE; a = NO ACTION, r = RESTRICT, d = SET DEFAULT.
    const blocking = references
      .filter((row) => row.reference !== OWNER_REFERENCE && !['n', 'c'].includes(row.delete_action))
      .map((row) => `${row.reference} (${row.delete_action})`);
    expect(
      blocking,
      'A reference to auth.users that blocks or defaults on user delete — use ON DELETE SET NULL (attribution) or CASCADE (owned rows); model: 20261101100000_user_erasure_attribution_set_null.sql',
    ).toEqual([]);
  });

  it('keeps NO ACTION only on the owner column of auth.users', async () => {
    const noAction = rowsOf<{ reference: string }>(
      await database.execute(sql`
      SELECT c.conrelid::regclass::text || '.' || a.attname AS reference
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass AND c.confdeltype = 'a'
    `),
    );
    expect(noAction.map((row) => row.reference)).toEqual([OWNER_REFERENCE]);
  });

  it('declares the same delete action on every Drizzle reference to users', async () => {
    const declared: string[] = [];
    const schemaModules = await loadSchemaModules('src');
    for (const schemaModule of schemaModules) {
      for (const exported of Object.values(schemaModule)) {
        if (!is(exported, PgTable)) continue;
        const table = getTableConfig(exported);
        for (const foreignKey of table.foreignKeys) {
          const reference = foreignKey.reference();
          const referenced = getTableConfig(reference.foreignTable);
          if (referenced.schema !== 'auth' || referenced.name !== 'users') continue;
          const column = reference.columns.map((item) => item.name).join(',');
          const qualified = `${table.schema ?? 'public'}.${table.name}.${column}`;
          declared.push(`${qualified} ${foreignKey.onDelete ?? 'no action'}`);
        }
      }
    }
    // Guard against a vacuous pass: every auth.users reference the migrations create is declared.
    expect(declared.length).toBeGreaterThan(100);

    const blocking = declared
      .filter((entry) => !entry.startsWith(`${OWNER_REFERENCE} `))
      .filter((entry) => !/ (set null|cascade)$/.test(entry));
    expect(blocking).toEqual([]);
    expect(declared.filter((entry) => entry.startsWith(`${OWNER_REFERENCE} `))).toEqual([
      `${OWNER_REFERENCE} no action`,
    ]);
  });
});

/** Imports every `*.schema.ts` module under `directory` (test folders excluded). */
async function loadSchemaModules(directory: string): Promise<Record<string, unknown>[]> {
  const modules: Record<string, unknown>[] = [];
  for (const file of schemaFiles(directory)) {
    modules.push(
      (await import(`@/${file.slice('src/'.length).replace(/\.ts$/, '.js')}`)) as Record<
        string,
        unknown
      >,
    );
  }
  return modules;
}

function schemaFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === '__tests__' ? [] : schemaFiles(path);
    return path.endsWith('.schema.ts') ? [path] : [];
  });
}
