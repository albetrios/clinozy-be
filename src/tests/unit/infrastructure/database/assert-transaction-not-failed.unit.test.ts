import { describe, expect, it, vi } from 'vitest';
import { assertTransactionNotFailed } from '@/infrastructure/database/contexts/database-context-runtime.js';

/**
 * The guard reads node-postgres's transaction status, which arrives with the ReadyForQuery that
 * follows a statement — after the statement's own error message, possibly in a later TCP chunk.
 * These fake clients reproduce both orders deterministically; the real driver is covered by
 * `transaction-savepoint.db.unit.test.ts`.
 */
type ClientState = { readyForQuery: boolean; status: string };

/** A Drizzle transaction handle over a fake node-postgres client that reads `state` live. */
function fakeTransaction({
  state,
  query = vi.fn(async () => undefined),
}: {
  state: ClientState;
  query?: ReturnType<typeof vi.fn>;
}) {
  return {
    query,
    handle: {
      session: {
        client: {
          get readyForQuery() {
            return state.readyForQuery;
          },
          getTransactionStatus: () => state.status,
          query,
        },
      },
    },
  };
}

describe('assertTransactionNotFailed', () => {
  it('refuses a failed transaction whose status has arrived, with no round trip', async () => {
    const { handle, query } = fakeTransaction({ state: { readyForQuery: true, status: 'E' } });
    await expect(assertTransactionNotFailed(handle)).rejects.toThrow(/failed_statement_caught/);
    expect(query).not.toHaveBeenCalled();
  });

  it('lets a healthy transaction through, with no round trip', async () => {
    const { handle, query } = fakeTransaction({ state: { readyForQuery: true, status: 'T' } });
    await expect(assertTransactionNotFailed(handle)).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });

  it('waits for the status when the error message came before its ReadyForQuery', async () => {
    const state: ClientState = { readyForQuery: false, status: 'T' };
    const query = vi.fn(async () => {
      // The pending ReadyForQuery lands, then the queued statement fails as Postgres would.
      state.readyForQuery = true;
      state.status = 'E';
      throw Object.assign(new Error('current transaction is aborted'), { code: '25P02' });
    });
    const { handle } = fakeTransaction({ state, query });

    await expect(assertTransactionNotFailed(handle)).rejects.toThrow(/failed_statement_caught/);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a handle that is not a node-postgres transaction', async () => {
    await expect(assertTransactionNotFailed({ execute: vi.fn() })).resolves.toBeUndefined();
    await expect(assertTransactionNotFailed(undefined)).resolves.toBeUndefined();
  });
});
