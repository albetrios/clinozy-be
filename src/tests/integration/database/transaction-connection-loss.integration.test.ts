import postgres from 'postgres';
import { createServer, connect, type AddressInfo, type Server, type Socket } from 'node:net';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPostgresOptions } from '@/infrastructure/database/connection.js';
import { env } from '@/shared/config/env.config.js';

/**
 * A connection lost under an open transaction must reject the transaction, not crash the process.
 *
 * postgres.js 3.4.9 keeps writing to a transaction's Connection after its socket closed — the
 * callback's next statement, or begin()'s own ROLLBACK — and the write throws from a setImmediate
 * ("Cannot read properties of null (reading 'write')"). The API and worker exit on an uncaught
 * exception, so a failover or network drop mid-transaction took the process down. The pinned
 * postgres.js patch (`pnpm-workspace.yaml`) settles those writes with CONNECTION_CLOSED instead.
 * Every request's unit of work runs in a transaction, so this is the path that matters.
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
});
