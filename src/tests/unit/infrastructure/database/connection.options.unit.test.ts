import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPostgresOptions,
  closeDatabase,
  isNeonPoolerConnection,
  sql,
  primeDatabasePool,
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
  });

  describe('isNeonPoolerConnection', () => {
    it('detects Neon pooler hostnames', () => {
      expect(
        isNeonPoolerConnection(
          'postgresql://user:pass@ep-cool-name-pooler.us-east-2.aws.neon.tech/neondb',
        ),
      ).toBe(true);
    });

    it('detects pgbouncer query parameter', () => {
      expect(
        isNeonPoolerConnection('postgresql://user:pass@localhost:5432/app?pgbouncer=true'),
      ).toBe(true);
    });

    it('returns false for direct non-pooler URLs', () => {
      expect(isNeonPoolerConnection('postgresql://user:pass@localhost:5432/app')).toBe(false);
    });
  });

  describe('buildPostgresOptions', () => {
    it('disables prepared statements for pooler URLs (Neon transaction pooling)', () => {
      const options = buildPostgresOptions(
        'postgresql://user:pass@ep-example-pooler.aws.neon.tech/neondb?sslmode=require',
      );
      expect(options.prepare).toBe(false);
    });

    it('does not set prepare for direct database URLs', () => {
      const options = buildPostgresOptions('postgresql://user:pass@localhost:5432/clinozy');
      expect(options).not.toHaveProperty('prepare');
    });

    it('applies prepare:false to any pooler hostname with pgbouncer enabled', () => {
      const options = buildPostgresOptions(
        'postgresql://user:pass@reporting-pooler.aws.neon.tech/neondb?pgbouncer=true',
      );
      expect(options.prepare).toBe(false);
    });

    it('resolves the pool max from DATABASE_POOL_MAX (defaults to 30 in the env schema)', () => {
      const options = buildPostgresOptions('postgresql://user:pass@localhost:5432/clinozy');
      // DATABASE_POOL_MAX has an explicit schema default of 30; the env is always a number.
      expect(options.max).toBe(env.DATABASE_POOL_MAX);
    });
  });

  describe('closeDatabase (EX-32)', () => {
    it('drains using the shared shutdown timeout so it can never exceed the watchdog budget', async () => {
      // EX-32: closeDatabase must use the shutdown budget the watchdog is derived from — in SECONDS,
      // the unit postgres.js `end` takes. The milliseconds passed before were a 15 000-second wait.
      const endSpy = vi.spyOn(sql, 'end').mockResolvedValue(undefined);
      try {
        await closeDatabase();
        expect(endSpy).toHaveBeenCalledWith({ timeout: Math.ceil(getShutdownTimeoutMs() / 1_000) });
      } finally {
        endSpy.mockRestore();
      }
    });

    it('drains for what is left of the shared budget once shutdown has begun', async () => {
      const endSpy = vi.spyOn(sql, 'end').mockResolvedValue(undefined);
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
      try {
        startShutdownBudget();
        // The steps before (worker close, queue drains) took 11 of the 15 seconds.
        now.mockReturnValue(1_000_000 + getShutdownTimeoutMs() - 4_000);
        await closeDatabase();
        expect(endSpy).toHaveBeenCalledWith({ timeout: 4 });
      } finally {
        resetShutdownBudgetForTests();
        now.mockRestore();
        endSpy.mockRestore();
      }
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
