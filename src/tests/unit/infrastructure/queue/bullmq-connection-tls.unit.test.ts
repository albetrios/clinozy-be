import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisUrl = vi.hoisted(() => ({ current: 'redis://localhost:6379/0' }));

vi.mock('@/infrastructure/cache/redis-url.util.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveBullMqRedisUrl: () => redisUrl.current,
}));

/**
 * Every BullMQ queue and worker connects with these options. They carried no TLS, so against a
 * `rediss://` endpoint — what the TLS boot guard requires off a private network — every queue and
 * worker spoke plaintext to a TLS server and never connected.
 */
describe('getBullMQConnectionOptions TLS', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('connects over TLS, verifying the certificate, for a rediss:// URL', async () => {
    redisUrl.current = 'rediss://default:secret@redis.example.com:6380/0';
    const { getBullMQConnectionOptions, getBullMQProducerConnectionOptions } = await import(
      '@/infrastructure/queue/connection.js'
    );

    expect(getBullMQConnectionOptions().tls).toEqual({ rejectUnauthorized: true });
    // Producers inherit it.
    expect(getBullMQProducerConnectionOptions().tls).toEqual({ rejectUnauthorized: true });
  });

  it('stays plaintext for a redis:// URL on a private network', async () => {
    redisUrl.current = 'redis://redis.railway.internal:6379/0';
    const { getBullMQConnectionOptions } = await import('@/infrastructure/queue/connection.js');

    expect(getBullMQConnectionOptions()).not.toHaveProperty('tls');
  });
});
