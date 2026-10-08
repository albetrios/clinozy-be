import postgres from 'postgres';
import { createRequire } from 'node:module';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { buildPostgresOptions } from '@/infrastructure/database/connection.js';
import { env } from '@/shared/config/env.config.js';

const commonJsDrizzle = createRequire(import.meta.url)('drizzle-orm/postgres-js')
  .drizzle as typeof drizzle;

describe('Drizzle postgres.js statement preparation', () => {
  it.each([
    { driver: 'ESM', createDatabase: drizzle, prepare: true },
    { driver: 'ESM', createDatabase: drizzle, prepare: false },
    { driver: 'CommonJS', createDatabase: commonJsDrizzle, prepare: true },
    { driver: 'CommonJS', createDatabase: commonJsDrizzle, prepare: false },
  ])('honors $driver prepare=$prepare inside transactions', async ({ createDatabase, prepare }) => {
    const client = postgres(env.DATABASE_URL, {
      ...buildPostgresOptions(env.DATABASE_URL),
      max: 1,
      prepare,
    });
    const database = createDatabase(client);
    const read = sql`SELECT current_setting('app.current_organization_public_id', true) AS organization, ${1}::int AS marker`;
    try {
      for (const organization of ['prepared-context-a', 'prepared-context-b']) {
        await database.transaction(async (transaction) => {
          await transaction.execute(
            sql`SELECT set_config('app.current_organization_public_id', ${organization}, true)`,
          );
          for (let iteration = 0; iteration < 8; iteration++) {
            const rows = await transaction.execute(read);
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
      const statements = await client`
        SELECT statement, generic_plans + custom_plans AS executions
        FROM pg_prepared_statements
        WHERE statement ILIKE 'select current_setting(%'
      `;
      if (prepare) {
        expect(statements).toHaveLength(2);
        for (const statement of statements) {
          expect(Number(statement.executions)).toBeGreaterThanOrEqual(16);
        }
      } else {
        expect(statements).toHaveLength(0);
      }
    } finally {
      await client.end({ timeout: 5 });
    }
  });
});
