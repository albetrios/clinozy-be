import { connectRedis, redisConnection } from '@/infrastructure/cache/redis.client.js';
import { scanLogicalKeys } from '@/infrastructure/cache/redis-scan.util.js';
import { env } from '@/shared/config/env.config.js';

/** Key families kept between cases: BullMQ's own keys under `<prefix>bull:`. */
const KEPT_KEY_PREFIX = 'bull:';

/**
 * Whether flushing test-scoped Redis keys is acceptable (the same gate as the Postgres wipe): the
 * single `TEST_MODE` flag. It defaults false and a schema refine forbids `true` in production, so a
 * deployed store is never flushed.
 */
function isRedisWipeAllowed(): boolean {
  return env.TEST_MODE;
}

/**
 * Delete every key the harness wrote under its own prefix, except BullMQ's.
 *
 * @remarks
 * - **Algorithm:** {@link scanLogicalKeys} over `*` under the client's prefix, then DEL, which
 *   re-applies it. Everything goes — caches, idempotency records, cooldowns, MFA counters,
 *   commit-dispatch tasks, rate-limit counters — so a key family added later is cleared too.
 *   BullMQ keys stay: a suite's queues and workers live across its cases.
 * - **Failure modes:** throws unless the prefix ends in `:test:` (the harness forces
 *   `<stem>:worker-<n>:test:`, the chaos bootstrap `<stem>:test:`), so this can never empty a
 *   running `pnpm dev`'s namespace.
 * - **Notes:** clearing per key family (`perm:*`, `idempotency:*`, …) is what let keys leak
 *   between cases: a SCAN pattern needs the prefix ioredis does not add, and a family list goes
 *   stale the day a new family is added.
 */
async function deleteHarnessKeys(): Promise<void> {
  // The prefix the client actually writes under, not a fresh resolution of the env.
  const keyPrefix = redisConnection.options.keyPrefix ?? '';
  if (!keyPrefix.endsWith(':test:')) {
    throw new Error(
      `Refusing to clear Redis keys under "${keyPrefix}": the test harness only clears its own ` +
        '`…:test:` namespace (src/tests/setup.ts and the chaos bootstrap force it).',
    );
  }
  for await (const keys of scanLogicalKeys({ redis: redisConnection, logicalPattern: '*' })) {
    const deletable = keys.filter((key) => !key.startsWith(KEPT_KEY_PREFIX));
    if (deletable.length > 0) {
      await redisConnection.del(...deletable);
    }
  }
}

/**
 * Delete test-scoped Redis keys so caches, counters and stored state do not leak across Vitest
 * cases in the same worker process (Postgres truncation does not touch Redis).
 */
export async function cleanupTestRedis(): Promise<void> {
  if (!isRedisWipeAllowed()) {
    throw new Error(
      'cleanupTestRedis is disabled: it requires TEST_MODE=true, which the Vitest harness sets. ' +
        'TEST_MODE is refine-forbidden in production, so this can never flush a deployed Redis.',
    );
  }

  try {
    await connectRedis();
  } catch {
    return;
  }

  if (redisConnection.status !== 'ready') {
    return;
  }

  await deleteHarnessKeys();
}
