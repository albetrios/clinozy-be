import type pg from 'pg';
import { createServer, connect, type AddressInfo, type Server, type Socket } from 'node:net';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPostgresOptions, createDatabasePool } from '@/infrastructure/database/connection.js';
import { env } from '@/shared/config/env.config.js';
import { isTransientConnectionError } from '@/shared/utils/infrastructure/postgres-error.util.js';
import { getOperatorPool } from '@/tests/helpers/operator-database.js';

/**
 * A connection lost under an open transaction must reject the transaction, not crash the process,
 * and no statement of that transaction may run on another session.
 *
 * node-postgres emits `error` on a client whose connection drops — checked out or idle. With no
 * listener that is an uncaught exception, and the API and worker exit on one; `createDatabasePool`
 * listens on the pool and on every client it connects, so the drop is logged instead. A dropped
 * client is never reconnected: every later statement on it rejects, and the pool discards it when it
 * is released. Every request's unit of work runs in a transaction, so this is the path that matters.
 */

/** A loopback TCP proxy in front of the test database whose connections can be cut at will. */
type CuttableProxy = { url: string; cut: () => void; close: () => Promise<void> };

const openProxies: CuttableProxy[] = [];

afterEach(async () => {
  await Promise.all(openProxies.splice(0).map((proxy) => proxy.close()));
});

async function startCuttableProxy(databaseUrl: string): Promise<CuttableProxy> {
  const target = new URL(databaseUrl);
  const sockets = new Set<Socket>();
  const server: Server = createServer((client) => {
    const upstream = connect(Number(target.port || 5432), target.hostname);
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on('error', () => undefined);
      socket.on('close', () => sockets.delete(socket));
    }
    client.pipe(upstream).pipe(client);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const proxied = new URL(databaseUrl);
  proxied.hostname = '127.0.0.1';
  proxied.port = String((server.address() as AddressInfo).port);
  const proxy: CuttableProxy = {
    url: proxied.toString(),
    cut: () => {
      for (const socket of sockets) socket.destroy();
    },
    close: () => {
      proxy.cut();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
  openProxies.push(proxy);
  return proxy;
}

/** The application's pool factory on `databaseUrl`, sized for one test. */
function createTestPool({ databaseUrl, max }: { databaseUrl: string; max: number }): pg.Pool {
  return createDatabasePool({
    config: { ...buildPostgresOptions(databaseUrl), max, connectionTimeoutMillis: 3_000 },
    poolName: 'connection-loss-test',
  });
}

/** How a statement settled: a lost connection, or anything else by name. */
function outcomeOf(error: unknown): string {
  return isTransientConnectionError(error) ? 'connection lost' : String(error);
}

/** Ends `pool`, giving up after two seconds so a hung drain fails the assertion, not the run. */
async function endPool(pool: pg.Pool): Promise<void> {
  await Promise.race([
    pool.end().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}

describe('a connection lost under an open transaction', () => {
  it.each([{ moment: 'mid-query' }, { moment: 'between-queries' }])(
    '$moment: rejects as a lost connection and nothing escapes uncaught',
    async ({ moment }) => {
      const proxy = await startCuttableProxy(env.DATABASE_URL);
      const pool = createTestPool({ databaseUrl: proxy.url, max: 1 });
      const database = drizzle({ client: pool });
      const uncaught: unknown[] = [];
      const recordUncaught = (error: unknown) => uncaught.push(error);
      process.on('uncaughtException', recordUncaught);
      try {
        const outcome = await database
          .transaction(async (transaction) => {
            await transaction.execute(sql`SELECT 1`);
            if (moment === 'mid-query') {
              setTimeout(proxy.cut, 50);
              await transaction.execute(sql`SELECT pg_sleep(0.5)`);
            } else {
              proxy.cut();
              await new Promise((resolve) => setTimeout(resolve, 50));
              await transaction.execute(sql`SELECT 2`);
            }
          })
          .then(() => 'committed', outcomeOf);
        // A dropped client's `error` event can arrive on a later tick than the rejection.
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(outcome).toBe('connection lost');
        expect(uncaught).toEqual([]);
      } finally {
        process.off('uncaughtException', recordUncaught);
        await endPool(pool);
      }
    },
  );

  it('a callback that carries on after the loss cannot run a statement outside the transaction', async () => {
    const proxy = await startCuttableProxy(env.DATABASE_URL);
    const pool = createTestPool({ databaseUrl: proxy.url, max: 1 });
    const database = drizzle({ client: pool });
    let queued: Promise<string> | undefined;
    let settleLater: (outcome: string) => void = () => undefined;
    const later = new Promise<string>((resolve) => {
      settleLater = resolve;
    });
    try {
      const outcome = await database
        .transaction(async (transaction) => {
          await transaction.execute(sql`SELECT 1`);
          // Waits for the only connection, so the pool opens a new one once the lost one is released.
          queued = pool.query('SELECT 1').then(() => 'ok', outcomeOf);
          setTimeout(proxy.cut, 50);
          await transaction.execute(sql`SELECT pg_sleep(0.5)`).catch(() => undefined);
          // The transaction is gone; a statement sent now must not reach another session, where it
          // would run — and commit — on its own.
          settleLater(
            await transaction
              .execute(sql`SELECT 1`)
              .then(() => 'ran outside the transaction', outcomeOf),
          );
        })
        .then(() => 'committed', outcomeOf);

      expect(outcome).toBe('connection lost');
      expect(
        await Promise.race([
          later,
          new Promise((resolve) => setTimeout(() => resolve('never settled'), 3_000)),
        ]),
      ).toBe('connection lost');
      // The pool itself recovers: the query that waited runs on a new connection.
      expect(await queued).toBe('ok');
    } finally {
      await endPool(pool);
    }
  });

  it('a backend terminated between statements: the next statement never reaches another session', async () => {
    const pool = createTestPool({ databaseUrl: env.DATABASE_URL, max: 1 });
    // The application role may not terminate backends (42501); an operator, a failover or an
    // idle-in-transaction timeout does — so the harness's operator connection plays that part.
    const terminator = getOperatorPool();
    const database = drizzle({ client: pool });
    let queued: Promise<string> | undefined;
    let settleNext: (outcome: string) => void = () => undefined;
    const next = new Promise<string>((resolve) => {
      settleNext = resolve;
    });
    try {
      const outcome = await database
        .transaction(async (transaction) => {
          const result = await transaction.execute<{ pid: number }>(
            sql`SELECT pg_backend_pid() AS pid`,
          );
          const [backend] = Array.isArray(result)
            ? (result as { pid: number }[])
            : ((result as { rows?: { pid: number }[] }).rows ?? []);
          queued = pool.query('SELECT 1').then(() => 'ok', outcomeOf);
          await terminator.query('SELECT pg_terminate_backend($1)', [backend?.pid ?? 0]);
          await new Promise((resolve) => setTimeout(resolve, 200));
          settleNext(
            await transaction
              .execute(sql`SELECT 1`)
              .then(() => 'ran outside the transaction', outcomeOf),
          );
        })
        .then(() => 'committed', outcomeOf);

      expect(outcome).toBe('connection lost');
      expect(
        await Promise.race([
          next,
          new Promise((resolve) => setTimeout(() => resolve('never settled'), 3_000)),
        ]),
      ).toBe('connection lost');
      expect(await queued).toBe('ok');
    } finally {
      await endPool(pool);
    }
  });

  it('shutting down after the loss: end() resolves promptly', async () => {
    const proxy = await startCuttableProxy(env.DATABASE_URL);
    const pool = createTestPool({ databaseUrl: proxy.url, max: 2 });
    const database = drizzle({ client: pool });
    await database
      .transaction(async (transaction) => {
        await transaction.execute(sql`SELECT 1`);
        pool.query('SELECT 1').catch(() => undefined);
        setTimeout(proxy.cut, 50);
        await transaction.execute(sql`SELECT pg_sleep(0.5)`);
      })
      .catch(() => undefined);

    // closeDatabase() races each pool's end() against the remaining shutdown budget; a pool that
    // never ended would hold the API or worker until that budget ran out after a database blip.
    const startedAt = Date.now();
    const ended = await Promise.race([
      pool.end().then(() => 'ended'),
      new Promise((resolve) => setTimeout(() => resolve('still running after 5 s'), 5_000)),
    ]);

    expect(ended).toBe('ended');
    expect(Date.now() - startedAt).toBeLessThan(3_000);
  });
});
