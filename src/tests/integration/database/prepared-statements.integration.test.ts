import { createRequire } from 'node:module';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { buildPostgresOptions, createDatabasePool } from '@/infrastructure/database/connection.js';
import { env } from '@/shared/config/env.config.js';

const commonJsDrizzle = createRequire(import.meta.url)('drizzle-orm/node-postgres')
  .drizzle as typeof drizzle;

/**
 * Drizzle's node-postgres session sends every statement unnamed, so the server keeps no prepared
 * statement between checkouts: a transaction-mode pooler (Neon's `-pooler` host) can hand the next
 * statement to another backend without breaking it. Inside a transaction, every statement still
 * reads the transaction's own `set_config` value.
 */
describe('Drizzle node-postgres statement preparation', () => {
  it.each([
    { driver: 'ESM', createDatabase: drizzle },
    { driver: 'CommonJS', createDatabase: commonJsDrizzle },
  ])(
    '$driver: reads the transaction context and leaves no prepared statement',
    async ({ createDatabase }) => {
      const pool = createDatabasePool({
        config: { ...buildPostgresOptions(env.DATABASE_URL), max: 1 },
        poolName: 'prepared-statements-test',
      });
      const database = createDatabase({ client: pool });
      const read = sql`SELECT current_setting('app.current_organization_public_id', true) AS organization, ${1}::int AS marker`;
      try {
        for (const organization of ['prepared-context-a', 'prepared-context-b']) {
          await database.transaction(async (transaction) => {
            await transaction.execute(
              sql`SELECT set_config('app.current_organization_public_id', ${organization}, true)`,
            );
            for (let iteration = 0; iteration < 8; iteration++) {
              const result = await transaction.execute(read);
              const rows = Array.isArray(result)
                ? (result as Record<string, unknown>[])
                : ((result as { rows?: Record<string, unknown>[] }).rows ?? []);
              expect(rows[0]).toMatchObject({ organization, marker: 1 });
              const mapped = await transaction
                .select({
                  organization: sql<string>`current_setting('app.current_organization_public_id', true)`,
                  marker: sql<number>`${1}::int`,
                })
                .from(sql`(VALUES (1)) AS seed(marker)`);
              expect(mapped[0]).toMatchObject({ organization, marker: 1 });
            }
          });
        }
        // max: 1, so this runs on the same connection as every statement above.
        const { rows: statements } = await pool.query(
          'SELECT statement FROM pg_prepared_statements WHERE from_sql = false',
        );
        expect(statements).toEqual([]);
      } finally {
        await pool.end();
      }
    },
  );
});
