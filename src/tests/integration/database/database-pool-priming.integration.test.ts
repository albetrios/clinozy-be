import { describe, expect, it } from 'vitest';
import { primeDatabasePool, sql } from '@/infrastructure/database/connection.js';
import { env } from '@/shared/config/env.config.js';

/**
 * `server.ts` primes the pool before `listen`, so a fresh process's first burst does not open its
 * connections while it is busiest. Proof that priming opened them: every connection a full-width
 * burst then lands on was started before priming returned.
 */
// Skipped under `pnpm test:rls-role`: that lane switches each pooled session to `clinozy_be_app`
// after login, and Postgres then hides `pg_stat_activity.backend_start` of those sessions from the
// role itself. Priming is a `SELECT 1` per connection — nothing about it depends on the role.
const runAsApplicationBehaviour = !process.env.TEST_DATABASE_ROLE;

describe.runIf(runAsApplicationBehaviour)('primeDatabasePool', () => {
  it('opens every pool connection before the first burst', async () => {
    await primeDatabasePool();
    const [primed] = await sql<{ primed_at: string }[]>`
      SELECT clock_timestamp()::text AS primed_at
    `;
    if (!primed) throw new Error('clock_timestamp() returned no row');

    const burst = await Promise.all(
      Array.from(
        { length: env.DATABASE_POOL_MAX },
        () => sql<{ pid: number; opened_before_priming_returned: boolean }[]>`
          SELECT
            pg_backend_pid() AS pid,
            backend_start <= ${primed.primed_at}::timestamptz AS opened_before_priming_returned,
            pg_sleep(0.05)
          FROM pg_stat_activity
          WHERE pid = pg_backend_pid()
        `,
      ),
    );

    const connections = burst.map(([row]) => row);
    expect(new Set(connections.map((connection) => connection?.pid)).size).toBe(
      env.DATABASE_POOL_MAX,
    );
    for (const connection of connections) {
      expect(connection?.opened_before_priming_returned).toBe(true);
    }
  });
});
