import postgres from 'postgres';
import { createServer, connect, type AddressInfo, type Server, type Socket } from 'node:net';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPostgresOptions } from '@/infrastructure/database/connection.js';
import { env } from '@/shared/config/env.config.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';

/**
 * A connection lost under an open transaction must reject the transaction, not crash the process.
 *
 * postgres.js 3.4.9 keeps a transaction's Connection after its session ends. With nothing queued,
 * the callback's next statement — or begin()'s own ROLLBACK — is written onto the closed socket from
 * a setImmediate and throws ("Cannot read properties of null (reading 'write')"); the API and worker
 * exit on an uncaught exception. With a query queued, the pool reconnects that same Connection and
 * the callback's next statements — its COMMIT included — run on the new session, outside any
 * transaction, each committing on its own. The pinned postgres.js patch (`pnpm-workspace.yaml`)
 * settles the writes with CONNECTION_CLOSED and refuses every statement of a transaction whose
 * session is gone. Every request's unit of work runs in a transaction, so this is the path that
 * matters.
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

/** The error code of a rejection — postgres.js's own, or the one Drizzle wraps as `cause`. */
function errorCode(error: unknown): string | undefined {
  const failure = error as { code?: string; cause?: { code?: string } };
  return failure.code ?? failure.cause?.code;
}

describe('a connection lost under an open transaction', () => {
  it.each([{ moment: 'mid-query' }, { moment: 'between-queries' }])(
    '$moment: rejects with CONNECTION_CLOSED and nothing escapes uncaught',
    async ({ moment }) => {
      const proxy = await startCuttableProxy(env.DATABASE_URL);
      const client = postgres(proxy.url, {
        ...buildPostgresOptions(proxy.url),
        max: 1,
        connect_timeout: 3,
      });
      const database = drizzle(client);
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
          .then(
            () => 'committed',
            (error: unknown) => errorCode(error),
          );
        // The ROLLBACK the transaction sends after the failure is written on a later tick.
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(outcome).toBe('CONNECTION_CLOSED');
        expect(uncaught).toEqual([]);
      } finally {
        process.off('uncaughtException', recordUncaught);
        await Promise.race([
          client.end({ timeout: 1 }),
          new Promise((resolve) => setTimeout(resolve, 2_000)),
        ]);
      }
    },
  );

  it('a callback that carries on after the loss cannot run a statement outside the transaction', async () => {
    const proxy = await startCuttableProxy(env.DATABASE_URL);
    const client = postgres(proxy.url, {
      ...buildPostgresOptions(proxy.url),
      max: 1,
      connect_timeout: 3,
    });
    const database = drizzle(client);
    let queued: Promise<string> | undefined;
    let settleLater: (outcome: string) => void = () => undefined;
    const later = new Promise<string>((resolve) => {
      settleLater = resolve;
    });
    try {
      const outcome = await database
        .transaction(async (transaction) => {
          await transaction.execute(sql`SELECT 1`);
          // Waits for the only connection, so the pool reconnects that connection once it closes.
          queued = client`SELECT 1`.then(
            () => 'ok',
            (error: unknown) => errorCode(error) ?? 'error',
          );
          setTimeout(proxy.cut, 50);
          await transaction.execute(sql`SELECT pg_sleep(0.5)`).catch(() => undefined);
          // The transaction is gone; a statement sent now must not reach the reconnected session,
          // where it would run — and commit — on its own.
          settleLater(
            await transaction.execute(sql`SELECT 1`).then(
              () => 'ran outside the transaction',
              (error: unknown) => errorCode(error) ?? 'error',
            ),
          );
        })
        .then(
          () => 'committed',
          (error: unknown) => errorCode(error),
        );

      expect(outcome).toBe('CONNECTION_CLOSED');
      expect(
        await Promise.race([
          later,
          new Promise((resolve) => setTimeout(() => resolve('never settled'), 3_000)),
        ]),
      ).toBe('CONNECTION_CLOSED');
      // The pool itself recovers: the query that waited runs on the new session.
      expect(await queued).toBe('ok');
    } finally {
      await Promise.race([
        client.end({ timeout: 1 }),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
  });

  it('a backend terminated between statements: the next statement never reaches the reconnected session', async () => {
    const client = postgres(env.DATABASE_URL, {
      ...buildPostgresOptions(env.DATABASE_URL),
      max: 1,
      connect_timeout: 3,
    });
    // The application role may not terminate backends (42501); an operator, a failover or an
    // idle-in-transaction timeout does — so the harness's operator connection plays that part.
    const terminator = getOperatorSql();
    const database = drizzle(client);
    let queued: Promise<string> | undefined;
    let settleNext: (outcome: string) => void = () => undefined;
    const next = new Promise<string>((resolve) => {
      settleNext = resolve;
    });
    try {
      const outcome = await database
        .transaction(async (transaction) => {
          const [backend] = await transaction.execute<{ pid: number }>(
            sql`SELECT pg_backend_pid() AS pid`,
          );
          queued = client`SELECT 1`.then(
            () => 'ok',
            (error: unknown) => errorCode(error) ?? 'error',
          );
          await terminator`SELECT pg_terminate_backend(${backend?.pid ?? 0})`;
          await new Promise((resolve) => setTimeout(resolve, 200));
          settleNext(
            await transaction.execute(sql`SELECT 1`).then(
              () => 'ran outside the transaction',
              (error: unknown) => errorCode(error) ?? 'error',
            ),
          );
        })
        .then(
          () => 'committed',
          (error: unknown) => errorCode(error),
        );

      expect(outcome).toBe('CONNECTION_CLOSED');
      expect(
        await Promise.race([
          next,
          new Promise((resolve) => setTimeout(() => resolve('never settled'), 3_000)),
        ]),
      ).toBe('CONNECTION_CLOSED');
      expect(await queued).toBe('ok');
    } finally {
      await Promise.race([
        client.end({ timeout: 1 }),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
  });

  it('shutting down after the loss: end() resolves within its timeout', async () => {
    const proxy = await startCuttableProxy(env.DATABASE_URL);
    const client = postgres(proxy.url, {
      ...buildPostgresOptions(proxy.url),
      max: 2,
      connect_timeout: 3,
    });
    const database = drizzle(client);
    await database
      .transaction(async (transaction) => {
        await transaction.execute(sql`SELECT 1`);
        client`SELECT 1`.catch(() => undefined);
        setTimeout(proxy.cut, 50);
        await transaction.execute(sql`SELECT pg_sleep(0.5)`);
      })
      .catch(() => undefined);

    // closeDatabase() ends the pools with the remaining shutdown budget as the timeout; a pool that
    // never ended would hold the API or worker past its budget after a database blip.
    const startedAt = Date.now();
    const ended = await Promise.race([
      client.end({ timeout: 1 }).then(() => 'ended'),
      new Promise((resolve) => setTimeout(() => resolve('still running after 5 s'), 5_000)),
    ]);

    expect(ended).toBe('ended');
    expect(Date.now() - startedAt).toBeLessThan(3_000);
  });
});
