import { afterEach, describe, expect, it, vi } from 'vitest';

import { CHAOS_POSTGRES_PROXY_NAME } from '@/tests/chaos/chaos.constants.js';
import { withTemporaryListeningProxyToxinForChaosAssertion } from '@/tests/chaos/helpers/toxiproxy.client.js';

/**
 * A COLD pool under a connect-time fault: node-postgres opens a connection when a unit of work asks
 * for one, so the fault meets the unit of work at checkout. A database that resets the connection
 * fails it at once (503). One that answers slowly holds it until the connection opens: without a
 * deadline the unit of work outlives any request timeout and commits once the database answers —
 * after the client was told it failed; with one it gets 503 at the deadline and the late connection
 * rolls its transaction back unrun.
 *
 * Each case imports the context module into a fresh module graph, which builds a new pool (cold, no
 * connection yet) and re-reads the environment (so the deadline under test applies).
 */
const ACQUIRE_DEADLINE_MS = 1_500;
const USER_PUBLIC_ID = 'usr_chaoscoldpool00000000';
const RESET_PEER = {
  name: 'postgres_cold_pool_reset_peer',
  type: 'reset_peer',
  stream: 'upstream',
  toxicity: 1,
  attributes: { timeout: 0 },
} as const;
/**
 * Delays every message the client sends by a second, so opening a connection (startup and the SCRAM
 * exchange) takes seconds — inside `connectionTimeoutMillis`, past the acquire deadline.
 */
const SLOW_ANSWER = {
  name: 'postgres_cold_pool_slow_answer',
  type: 'latency',
  stream: 'upstream',
  toxicity: 1,
  attributes: { latency: 1_000, jitter: 0 },
} as const;

async function loadWithColdPool(acquireDeadlineMs: number) {
  vi.resetModules();
  process.env.DATABASE_POOL_ACQUIRE_TIMEOUT_MS = String(acquireDeadlineMs);
  const contexts = await import('@/infrastructure/database/contexts/database-context.js');
  const connection = await import('@/infrastructure/database/connection.js');
  return {
    withAppDatabaseContext: contexts.withAppDatabaseContext,
    scope: contexts.PRINCIPAL_SCOPE.VERIFIED({ userPublicId: USER_PUBLIC_ID }),
    closeDatabase: connection.closeDatabase,
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe('Chaos resilience: cold pool under a connect-time fault', () => {
  afterEach(() => {
    delete process.env.DATABASE_POOL_ACQUIRE_TIMEOUT_MS;
    vi.resetModules();
  });

  it('without a deadline, waits out a database that answers slowly and then runs the unit of work late', async () => {
    const { withAppDatabaseContext, scope, closeDatabase } = await loadWithColdPool(0);
    let ran = false;
    let settled = false;
    let unitOfWork: Promise<unknown> = Promise.resolve();

    await withTemporaryListeningProxyToxinForChaosAssertion(
      CHAOS_POSTGRES_PROXY_NAME,
      SLOW_ANSWER,
      async () => {
        unitOfWork = withAppDatabaseContext({
          scope,
          callback: async () => {
            ran = true;
          },
        });
        void unitOfWork.then(
          () => {
            settled = true;
          },
          () => {
            settled = true;
          },
        );
        await sleep(ACQUIRE_DEADLINE_MS + 500);
        expect(settled, 'a cold pool must still be waiting for a connection').toBe(false);
      },
    );

    // The connection opens after all: the transaction runs — the late write.
    await unitOfWork;
    expect(ran).toBe(true);
    await closeDatabase();
  });

  it('a database that answers slowly: 503 + Retry-After at the acquire deadline, never run late', async () => {
    const { withAppDatabaseContext, scope, closeDatabase } =
      await loadWithColdPool(ACQUIRE_DEADLINE_MS);
    let ran = false;

    await withTemporaryListeningProxyToxinForChaosAssertion(
      CHAOS_POSTGRES_PROXY_NAME,
      SLOW_ANSWER,
      async () => {
        const startedAt = Date.now();
        await expect(
          withAppDatabaseContext({
            scope,
            callback: async () => {
              ran = true;
            },
          }),
        ).rejects.toMatchObject({ statusCode: 503, retryAfterSeconds: 5 });
        const elapsedMilliseconds = Date.now() - startedAt;
        expect(elapsedMilliseconds).toBeGreaterThanOrEqual(ACQUIRE_DEADLINE_MS - 50);
        expect(elapsedMilliseconds).toBeLessThan(ACQUIRE_DEADLINE_MS + 3_000);
      },
    );

    // The slow connection opens after the deadline and reaches the abandoned transaction.
    await sleep(3_000);
    expect(ran, 'an abandoned unit of work must roll back unrun').toBe(false);
    // And the pool serves new work again.
    await expect(withAppDatabaseContext({ scope, callback: async () => 'served' })).resolves.toBe(
      'served',
    );
    await closeDatabase();
  });

  it('a database that resets the connection: 503 + Retry-After at once, never run late', async () => {
    const { withAppDatabaseContext, scope, closeDatabase } =
      await loadWithColdPool(ACQUIRE_DEADLINE_MS);
    let ran = false;

    await withTemporaryListeningProxyToxinForChaosAssertion(
      CHAOS_POSTGRES_PROXY_NAME,
      RESET_PEER,
      async () => {
        const startedAt = Date.now();
        await expect(
          withAppDatabaseContext({
            scope,
            callback: async () => {
              ran = true;
            },
          }),
        ).rejects.toMatchObject({ statusCode: 503, retryAfterSeconds: 5 });
        expect(Date.now() - startedAt).toBeLessThan(ACQUIRE_DEADLINE_MS);
      },
    );

    await sleep(1_000);
    expect(ran, 'a unit of work whose connection failed must never run').toBe(false);
    await expect(withAppDatabaseContext({ scope, callback: async () => 'served' })).resolves.toBe(
      'served',
    );
    await closeDatabase();
  });
});
