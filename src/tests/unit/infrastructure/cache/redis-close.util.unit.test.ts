import type { Redis } from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeRedisClient } from '@/infrastructure/cache/redis-close.util.js';
import { FIVE_SECONDS_MS } from '@/shared/constants/ttl.constants.js';

/** The three members `closeRedisClient` touches, with a controllable `QUIT`. */
function fakeClient({ status, quit }: { status: string; quit: () => Promise<'OK'> }) {
  return { status, quit: vi.fn(quit), disconnect: vi.fn() };
}

describe('closeRedisClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('disconnects a client that is not ready instead of sending QUIT (it would hold the process open)', async () => {
    // Reconnecting after a drop: QUIT is rejected while the retry timer keeps the event loop alive.
    const client = fakeClient({ status: 'reconnecting', quit: async () => 'OK' });

    await closeRedisClient({
      client: client as unknown as Redis,
      timeoutEvent: 'test.close.timeout',
    });

    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(client.quit).not.toHaveBeenCalled();
  });

  it('sends QUIT to a ready client and leaves no timer behind', async () => {
    const client = fakeClient({ status: 'ready', quit: async () => 'OK' });

    await closeRedisClient({
      client: client as unknown as Redis,
      timeoutEvent: 'test.close.timeout',
    });

    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disconnects a ready client whose QUIT does not answer within the timeout', async () => {
    const client = fakeClient({ status: 'ready', quit: () => new Promise<'OK'>(() => {}) });

    const closing = closeRedisClient({
      client: client as unknown as Redis,
      timeoutEvent: 'test.close.timeout',
    });
    await vi.advanceTimersByTimeAsync(FIVE_SECONDS_MS);
    await closing;

    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });
});
