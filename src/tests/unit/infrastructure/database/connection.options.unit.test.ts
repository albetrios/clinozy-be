import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPostgresOptions,
  closeDatabase,
  pool,
  primeDatabasePool,
  readDatabasePoolStatistics,
} from '@/infrastructure/database/connection.js';
import {
  getShutdownTimeoutMs,
  resetShutdownBudgetForTests,
  startShutdownBudget,
} from '@/infrastructure/queue/worker-runtime/shutdown-timing.util.js';
import { env } from '@/shared/config/env.config.js';

describe('postgres connection options', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  describe('buildPostgresOptions', () => {
    it('decides TLS from the URL and keeps the TLS parameters out of the connection string', () => {
      // node-postgres reads URL parameters over `ssl`; a `sslmode=require` left in the URL would
      // turn into certificate verification and break Railway's self-signed proxy.
      const options = buildPostgresOptions(
        'postgresql://user:pass@db.example.test:5432/clinozy?sslmode=require',
      );
      expect(options.connectionString).toBe('postgresql://user:pass@db.example.test:5432/clinozy');
      // Encrypted, certificate not verified — what `sslmode=require` means.
      expect(options.ssl).toBeTypeOf('object');
      expect((options.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized).toBe(false);
    });

    it('sets the three per-connection timeouts as startup parameters', () => {
      const options = buildPostgresOptions('postgresql://user:pass@localhost:5432/clinozy');
      expect(options.statement_timeout).toBeGreaterThan(0);
      expect(options.idle_in_transaction_session_timeout).toBeGreaterThan(0);
      expect(options.lock_timeout).toBe(env.DATABASE_LOCK_TIMEOUT_MS);
    });

    it('resolves the pool max from DATABASE_POOL_MAX (defaults to 70 in the env schema)', () => {
      const options = buildPostgresOptions('postgresql://user:pass@localhost:5432/clinozy');
      // DATABASE_POOL_MAX has an explicit schema default of 70; the env is always a number.
      expect(options.max).toBe(env.DATABASE_POOL_MAX);
    });
  });

  describe('closeDatabase (EX-32)', () => {
    it('ends the pool and returns once it has drained', async () => {
      const endSpy = vi.spyOn(pool, 'end').mockResolvedValue(undefined);
      try {
        await closeDatabase();
        expect(endSpy).toHaveBeenCalledTimes(1);
      } finally {
        endSpy.mockRestore();
      }
    });

    it('gives up on a pool that never drains once what is left of the shared budget has passed', async () => {
      // EX-32: pool.end() has no timeout of its own. The drain must end inside the watchdog
      // budget however long the shutdown steps before it took.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      // A drain that never finishes (pool.end() is overloaded; the spy types the callback form).
      const endSpy = vi
        .spyOn(pool, 'end')
        .mockImplementation((() => new Promise<void>(() => undefined)) as never);
      try {
        startShutdownBudget();
        // The steps before (worker close, queue drains) took all but 4 of the seconds.
        vi.setSystemTime(Date.now() + getShutdownTimeoutMs() - 4_000);
        let drained = false;
        const closing = closeDatabase().then(() => {
          drained = true;
        });
        await vi.advanceTimersByTimeAsync(3_999);
        expect(drained).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await closing;
        expect(drained).toBe(true);
      } finally {
        resetShutdownBudgetForTests();
        endSpy.mockRestore();
      }
    });
  });

  describe('readDatabasePoolStatistics', () => {
    it("reads the primary pool's live counts from node-postgres, in use = open − idle", () => {
      const counts = vi.spyOn(pool, 'totalCount', 'get').mockReturnValue(7);
      const idle = vi.spyOn(pool, 'idleCount', 'get').mockReturnValue(2);
      const waiting = vi.spyOn(pool, 'waitingCount', 'get').mockReturnValue(3);
      try {
        expect(readDatabasePoolStatistics()).toContainEqual({
          pool: 'primary',
          maxConnections: env.DATABASE_POOL_MAX,
          inUse: 5,
          idle: 2,
          waiting: 3,
        });
      } finally {
        counts.mockRestore();
        idle.mockRestore();
        waiting.mockRestore();
      }
    });

    it('leaves out the maintenance pool until something opens it', () => {
      expect(readDatabasePoolStatistics().map((statistics) => statistics.pool)).toEqual([
        'primary',
      ]);
    });
  });

  describe('primeDatabasePool', () => {
    it('keeps the connections that opened when some are refused (a rolling deploy at max_connections)', async () => {
      let attempt = 0;
      const openConnection = vi.fn(async () => {
        attempt += 1;
        if (attempt % 2 === 0) throw new Error('sorry, too many clients already');
      });

      await expect(primeDatabasePool(openConnection)).resolves.toBeUndefined();
      expect(openConnection).toHaveBeenCalledTimes(env.DATABASE_POOL_MAX);
    });

    it('fails the boot only when the database accepts no connection at all', async () => {
      await expect(
        primeDatabasePool(async () => {
          throw new Error('connection refused');
        }),
      ).rejects.toThrow('connection refused');
    });
  });
});
