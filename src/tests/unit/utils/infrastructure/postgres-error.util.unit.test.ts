import { describe, expect, it, vi } from 'vitest';
import {
  isDatabaseUnavailableError,
  isPostgresForeignKeyViolation,
  isPostgresUniqueViolation,
  isTransientConnectionError,
  runInsertWithPublicIdentifierRetry,
  runReadWithTransientRetry,
} from '@/shared/utils/infrastructure/postgres-error.util.js';

describe('postgres-error.util', () => {
  it('detects unique and foreign key violations at the top level', () => {
    expect(isPostgresUniqueViolation({ code: '23505' })).toBe(true);
    expect(isPostgresUniqueViolation({ code: '23503' })).toBe(false);
    expect(isPostgresForeignKeyViolation({ code: '23503' })).toBe(true);
    expect(isPostgresForeignKeyViolation(null)).toBe(false);
  });

  it('unwraps a Drizzle-wrapped PostgresError (code on error.cause)', () => {
    // Drizzle wraps the driver error: the SQLSTATE lives on `.cause`, not the top.
    const wrapped = { query: 'insert ...', cause: { name: 'PostgresError', code: '23505' } };
    expect(isPostgresUniqueViolation(wrapped)).toBe(true);
    const wrappedFk = { query: 'insert ...', cause: { code: '23503' } };
    expect(isPostgresForeignKeyViolation(wrappedFk)).toBe(true);
  });

  it('retries only a public_id unique violation, then succeeds', async () => {
    const insert = vi
      .fn()
      .mockRejectedValueOnce({ code: '23505', constraint: 'idx_users_public_id' })
      .mockResolvedValueOnce('ok');

    const result = await runInsertWithPublicIdentifierRetry({ insert, maxAttempts: 3 });
    expect(result).toBe('ok');
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it('retries a public_id collision even when wrapped in error.cause', async () => {
    const insert = vi
      .fn()
      .mockRejectedValueOnce({
        cause: { code: '23505', constraint: 'idx_organizations_public_id' },
      })
      .mockResolvedValueOnce('ok');

    const result = await runInsertWithPublicIdentifierRetry({ insert, maxAttempts: 3 });
    expect(result).toBe('ok');
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry a non-public_id unique violation (e.g. slug) — rethrows immediately', async () => {
    // A slug collision cannot be resolved by regenerating a public_id; retrying it
    // would run on the already-aborted transaction (25P02). It must rethrow at once.
    const slugViolation = { code: '23505', constraint: 'idx_organizations_slug' };
    const insert = vi.fn().mockRejectedValue(slugViolation);

    await expect(runInsertWithPublicIdentifierRetry({ insert, maxAttempts: 5 })).rejects.toBe(
      slugViolation,
    );
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('throws non-unique errors immediately', async () => {
    await expect(
      runInsertWithPublicIdentifierRetry({
        insert: async () => {
          throw new Error('other');
        },
      }),
    ).rejects.toThrow('other');
  });

  describe('isTransientConnectionError', () => {
    it('detects SQLSTATE class-08 and socket-reset codes, top-level and wrapped', () => {
      expect(isTransientConnectionError({ code: '08006' })).toBe(true); // connection_failure
      expect(isTransientConnectionError({ code: '57P01' })).toBe(true); // admin_shutdown
      expect(isTransientConnectionError({ cause: { code: 'ECONNRESET' } })).toBe(true);
    });

    it("detects node-postgres's code-less connection drops, top-level and wrapped", () => {
      expect(isTransientConnectionError(new Error('Connection terminated unexpectedly'))).toBe(
        true,
      );
      expect(
        isTransientConnectionError({
          cause: new Error('Client has encountered a connection error and is not queryable'),
        }),
      ).toBe(true);
      // A different message is not a connection drop.
      expect(isTransientConnectionError(new Error('Connection terminated'))).toBe(false);
    });

    it('returns false for query-logic errors (never retry a doomed query) and non-objects', () => {
      expect(isTransientConnectionError({ code: '23505' })).toBe(false); // unique_violation
      expect(isTransientConnectionError({ code: '42601' })).toBe(false); // syntax_error
      expect(isTransientConnectionError(null)).toBe(false);
      expect(isTransientConnectionError(new Error('plain'))).toBe(false);
    });
  });

  describe('isDatabaseUnavailableError', () => {
    it('detects a database that cannot be reached, is full or is starting, wrapped or not', () => {
      expect(isDatabaseUnavailableError({ code: 'ECONNREFUSED' })).toBe(true);
      expect(isDatabaseUnavailableError({ cause: { code: 'ENOTFOUND' } })).toBe(true);
      expect(isDatabaseUnavailableError({ code: '53300' })).toBe(true); // too_many_connections
      expect(isDatabaseUnavailableError({ code: '57P03' })).toBe(true); // cannot_connect_now
    });

    it("detects node-postgres's connect and checkout timeouts, and a dropped connection", () => {
      expect(isDatabaseUnavailableError(new Error('timeout exceeded when trying to connect'))).toBe(
        true,
      );
      expect(
        isDatabaseUnavailableError({
          cause: new Error('Connection terminated due to connection timeout'),
        }),
      ).toBe(true);
      expect(isDatabaseUnavailableError(new Error('Connection terminated unexpectedly'))).toBe(
        true,
      );
    });

    it('leaves a misconfigured login and query errors alone (they stay a 500)', () => {
      expect(isDatabaseUnavailableError({ code: '28P01' })).toBe(false); // invalid_password
      expect(isDatabaseUnavailableError({ code: '3D000' })).toBe(false); // invalid_catalog_name
      expect(isDatabaseUnavailableError({ code: '23505' })).toBe(false);
      expect(isDatabaseUnavailableError(new Error('plain'))).toBe(false);
      expect(isDatabaseUnavailableError(undefined)).toBe(false);
    });
  });

  describe('runReadWithTransientRetry', () => {
    it('retries a transient connection drop, then succeeds', async () => {
      const read = vi
        .fn()
        .mockRejectedValueOnce({ code: 'ECONNRESET' })
        .mockResolvedValueOnce('row');

      const result = await runReadWithTransientRetry({ read, maxAttempts: 3 });
      expect(result).toBe('row');
      expect(read).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry a non-transient error — rethrows immediately', async () => {
      const notFound = { code: '23505' };
      const read = vi.fn().mockRejectedValue(notFound);

      await expect(runReadWithTransientRetry({ read, maxAttempts: 3 })).rejects.toBe(notFound);
      expect(read).toHaveBeenCalledTimes(1);
    });

    it('gives up after maxAttempts transient failures and rethrows the last error', async () => {
      const drop = { cause: { code: '08006' } };
      const read = vi.fn().mockRejectedValue(drop);

      await expect(runReadWithTransientRetry({ read, maxAttempts: 3 })).rejects.toBe(drop);
      expect(read).toHaveBeenCalledTimes(3);
    });
  });
});
