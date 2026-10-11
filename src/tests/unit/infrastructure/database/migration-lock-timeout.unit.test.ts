import { describe, expect, it, vi } from 'vitest';
import {
  MIGRATION_LOCK_TIMEOUT_MS,
  MIGRATION_STATEMENT_TIMEOUT_MS,
  applyMigrationTimeouts,
  isMigrationLockTimeoutError,
  retryOnMigrationLockTimeout,
} from '@/infrastructure/database/migration/migration-lock-timeout.js';

const lockTimeout = Object.assign(new Error('canceling statement due to lock timeout'), {
  code: '55P03',
});

describe('migration lock and statement timeouts', () => {
  it('bounds both waits inside a transactional file, with SET LOCAL', async () => {
    const executed: string[] = [];
    await applyMigrationTimeouts({
      executor: { query: async (query: string) => executed.push(query) },
      scope: 'transaction',
    });
    expect(executed).toEqual([
      `SET LOCAL lock_timeout = '${MIGRATION_LOCK_TIMEOUT_MS}ms'`,
      `SET LOCAL statement_timeout = '${MIGRATION_STATEMENT_TIMEOUT_MS}ms'`,
    ]);
  });

  it('bounds the lock wait but lifts the statement cap for the non-transactional lane', async () => {
    const executed: string[] = [];
    await applyMigrationTimeouts({
      executor: { query: async (query: string) => executed.push(query) },
      scope: 'session',
    });
    expect(executed).toEqual([
      `SET lock_timeout = '${MIGRATION_LOCK_TIMEOUT_MS}ms'`,
      'SET statement_timeout = 0',
    ]);
  });

  it('recognises only SQLSTATE 55P03 as a lock timeout', () => {
    expect(isMigrationLockTimeoutError(lockTimeout)).toBe(true);
    expect(isMigrationLockTimeoutError(Object.assign(new Error('x'), { code: '57014' }))).toBe(
      false,
    );
    expect(isMigrationLockTimeoutError('55P03')).toBe(false);
  });

  it('retries a file whose lock wait timed out, and returns once it applies', async () => {
    const run = vi.fn().mockRejectedValueOnce(lockTimeout).mockResolvedValueOnce('applied');
    await expect(
      retryOnMigrationLockTimeout({ filename: 'x.sql', run, attempts: 3, delayMs: 0 }),
    ).resolves.toBe('applied');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('gives up after the last attempt and rethrows the lock timeout', async () => {
    const run = vi.fn().mockRejectedValue(lockTimeout);
    await expect(
      retryOnMigrationLockTimeout({ filename: 'x.sql', run, attempts: 3, delayMs: 0 }),
    ).rejects.toBe(lockTimeout);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('never retries any other failure', async () => {
    const syntaxError = Object.assign(new Error('syntax error'), { code: '42601' });
    const run = vi.fn().mockRejectedValue(syntaxError);
    await expect(
      retryOnMigrationLockTimeout({ filename: 'x.sql', run, attempts: 3, delayMs: 0 }),
    ).rejects.toBe(syntaxError);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
