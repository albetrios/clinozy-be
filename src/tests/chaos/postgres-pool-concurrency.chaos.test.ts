import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { database } from '@/infrastructure/database/connection.js';

/** Rows of a `database.execute()` result. */
function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : ((result as { rows?: T[] }).rows ?? []);
}

/**
 * High-concurrency simple queries through the shared node-postgres pool.
 */
describe('Chaos resilience: Postgres pool concurrency', () => {
  it('completes many parallel lightweight queries without connection errors', async () => {
    const concurrentQueryCount = 100;

    const results = await Promise.all(
      Array.from({ length: concurrentQueryCount }, (_, index) =>
        database
          .execute(sql`SELECT ${index}::int AS value`)
          .then((result) => rowsOf<{ value: number }>(result)),
      ),
    );

    expect(results).toHaveLength(concurrentQueryCount);
    for (const [index, rows] of results.entries()) {
      expect(rows[0]?.value).toBe(index);
    }
  });
});
