import { createServer, Socket, type AddressInfo, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The harness's network rules, checked under the harness itself (`src/tests/setup.ts` imports
 * `harness-provider-env.ts`, so nock is active here as in every lane).
 *
 * nock 15 intercepts every socket, not only HTTP. The pinned `@mswjs/interceptors` patch lets
 * loopback connections reach Node.js as-is; without it a refused Postgres connection was reported
 * as established (an emulated "connect", then nothing), and a client that writes on "connect" sent
 * its first message twice — every database-bound test failed with 08P01. Bumping nock or the
 * interceptors without the patch fails here first.
 */

const openServers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

/** Starts a loopback TCP server and resolves with its port. */
async function listenOnLoopback(server: Server): Promise<number> {
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

/** A loopback port nothing listens on (bound once, then released). */
async function closedLoopbackPort(): Promise<number> {
  const server = createServer();
  const port = await listenOnLoopback(server);
  openServers.splice(openServers.indexOf(server), 1);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

describe('test harness network isolation', () => {
  it('reports a refused loopback connection the way Node.js does: an error, never a connect', async () => {
    const port = await closedLoopbackPort();
    const events: string[] = [];

    await new Promise<void>((resolve) => {
      const socket = new Socket();
      // An intercepted socket never closes: give up after 2 s so the assertion shows its events.
      const giveUp = setTimeout(() => {
        socket.destroy();
        resolve();
      }, 2_000);
      socket.on('connect', () => events.push('connect'));
      socket.on('error', (error: NodeJS.ErrnoException) => events.push(`error:${error.code}`));
      socket.on('close', () => {
        clearTimeout(giveUp);
        resolve();
      });
      socket.connect(port, '127.0.0.1');
    });

    expect(events).toEqual(['error:ECONNREFUSED']);
  });

  it('delivers the first message of a client that writes on "connect" exactly once', async () => {
    // The shape of a Postgres startup message: a binary frame the client sends on "connect".
    const startupMessage = Buffer.from([0, 0, 0, 8, 0, 3, 0, 0]);
    const received: Buffer[] = [];
    const port = await listenOnLoopback(
      createServer((connection) => {
        connection.on('data', (chunk) => received.push(chunk));
      }),
    );

    const socket = new Socket();
    let connectCount = 0;
    socket.on('connect', () => {
      connectCount += 1;
      socket.write(startupMessage);
    });
    socket.connect(port, '127.0.0.1');
    await new Promise((resolve) => setTimeout(resolve, 200));
    socket.destroy();

    expect(connectCount).toBe(1);
    expect(Buffer.concat(received)).toEqual(startupMessage);
  });

  it('refuses a third-party host before any request leaves the machine', async () => {
    const failure = await fetch('https://api.example.com/v1/anything').then(
      () => undefined,
      (error: unknown) => error as Error & { cause?: { code?: string } },
    );

    expect(failure?.cause?.code).toBe('ENETUNREACH');
  });
});
