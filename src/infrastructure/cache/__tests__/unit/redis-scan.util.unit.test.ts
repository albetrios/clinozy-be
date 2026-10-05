import { describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import {
  buildPrefixedScanPattern,
  scanLogicalKeys,
} from '@/infrastructure/cache/redis-scan.util.js';

function fakeRedis(keyPrefix: string | undefined, pages: Array<[string, string[]]>) {
  const scan = vi.fn();
  for (const page of pages) scan.mockResolvedValueOnce(page);
  return { redis: { options: { keyPrefix }, scan } as unknown as Redis, scan };
}

async function collect(iterator: AsyncGenerator<string[]>): Promise<string[][]> {
  const pages: string[][] = [];
  for await (const page of iterator) pages.push(page);
  return pages;
}

describe('buildPrefixedScanPattern', () => {
  it('prepends the client key prefix, which ioredis leaves off a SCAN pattern', () => {
    const { redis } = fakeRedis('product:development:', []);
    expect(buildPrefixedScanPattern({ redis, logicalPattern: 'idempotency:*' })).toBe(
      'product:development:idempotency:*',
    );
  });

  it('escapes glob metacharacters in the prefix so it cannot widen the match', () => {
    const { redis } = fakeRedis('team*[a]?:', []);
    expect(buildPrefixedScanPattern({ redis, logicalPattern: 'cache:*' })).toBe(
      'team\\*\\[a\\]\\?:cache:*',
    );
  });

  it('uses the logical pattern alone for a client without a prefix', () => {
    const { redis } = fakeRedis(undefined, []);
    expect(buildPrefixedScanPattern({ redis, logicalPattern: 'cache:*' })).toBe('cache:*');
  });
});

describe('scanLogicalKeys', () => {
  it('pages until the cursor returns to 0 and yields keys with the prefix stripped', async () => {
    const { redis, scan } = fakeRedis('product:local:', [
      ['7', ['product:local:fastify-rate-limit-a', 'product:local:fastify-rate-limit-b']],
      ['9', []],
      ['0', ['product:local:fastify-rate-limit-c']],
    ]);

    const pages = await collect(
      scanLogicalKeys({ redis, logicalPattern: 'fastify-rate-limit-*', pageSize: 50 }),
    );

    expect(pages).toEqual([
      ['fastify-rate-limit-a', 'fastify-rate-limit-b'],
      ['fastify-rate-limit-c'],
    ]);
    expect(scan).toHaveBeenCalledTimes(3);
    expect(scan).toHaveBeenNthCalledWith(
      1,
      '0',
      'MATCH',
      'product:local:fastify-rate-limit-*',
      'COUNT',
      50,
    );
    expect(scan).toHaveBeenNthCalledWith(2, '7', 'MATCH', expect.any(String), 'COUNT', 50);
  });

  it('yields nothing when the namespace holds no matching key', async () => {
    const { redis } = fakeRedis('product:local:', [['0', []]]);
    expect(await collect(scanLogicalKeys({ redis, logicalPattern: '*' }))).toEqual([]);
  });
});
