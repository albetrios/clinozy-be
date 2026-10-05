import type { Redis } from 'ioredis';

/** Glob metacharacters SCAN `MATCH` interprets; escaped in the literal prefix part of a pattern. */
const GLOB_METACHARACTERS = /[*?[\]\\]/g;

/** Keys requested per SCAN page unless the caller asks for another page size. */
const DEFAULT_SCAN_PAGE_SIZE = 500;

/**
 * The SCAN `MATCH` pattern that finds `logicalPattern` under the client's own `keyPrefix`.
 *
 * @remarks
 * - **Why:** ioredis prepends `keyPrefix` to every key argument, but NOT to a SCAN or KEYS
 *   pattern. A pattern written the way the code writes keys (`idempotency:*`) therefore matches
 *   nothing — every stored key starts with the prefix — and a pattern with a leading `*` matches
 *   every environment's keys on a shared Redis.
 * - **Algorithm:** escapes the glob metacharacters in the prefix, so a configured
 *   `REDIS_KEY_PREFIX` containing `*`, `?` or `[` cannot widen the match into another namespace,
 *   then appends `logicalPattern` unchanged.
 */
export function buildPrefixedScanPattern(options: {
  redis: Redis;
  logicalPattern: string;
}): string {
  const keyPrefix = options.redis.options.keyPrefix ?? '';
  return `${keyPrefix.replace(GLOB_METACHARACTERS, '\\$&')}${options.logicalPattern}`;
}

/**
 * Pages SCAN over `logicalPattern` under the client's `keyPrefix`, yielding each non-empty page
 * as logical keys (prefix stripped).
 *
 * @remarks
 * - **Algorithm:** SCAN with the {@link buildPrefixedScanPattern} pattern until the cursor returns
 *   to `'0'`. SCAN returns fully-qualified keys; the prefix is sliced off so the page can go
 *   straight to DEL / UNLINK / GET, which re-apply it.
 * - **Notes:** SCAN may return a key more than once and may miss keys written during the scan —
 *   fine for clean-up and sampling, not for anything that needs an exact snapshot.
 */
export async function* scanLogicalKeys(options: {
  redis: Redis;
  logicalPattern: string;
  pageSize?: number;
}): AsyncGenerator<string[]> {
  const keyPrefix = options.redis.options.keyPrefix ?? '';
  const match = buildPrefixedScanPattern(options);
  const pageSize = options.pageSize ?? DEFAULT_SCAN_PAGE_SIZE;
  let cursor = '0';
  do {
    const [nextCursor, keys] = await options.redis.scan(cursor, 'MATCH', match, 'COUNT', pageSize);
    cursor = nextCursor;
    if (keys.length > 0) {
      yield keys.map((key) => key.slice(keyPrefix.length));
    }
  } while (cursor !== '0');
}
