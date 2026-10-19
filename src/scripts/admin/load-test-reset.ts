/**
 * Load-test reset (`pnpm load:reset`): removes what interrupted comprehensive-journey runs leave
 * behind, so the next run starts below its caps.
 *
 * On the LOCAL database, through the operator login (row-level security would hide every row from
 * the application role):
 *   - the roles the journey creates (`Role <run>…`, `Member Role <run>…`) and the cross-organization
 *     memberships it assigned them — a VU stopped mid-iteration never reaches its DELETEs, and the
 *     leftovers count toward `MEMBER_ROLE_MAX_PER_ORG`;
 *   - PENDING uploads (presigned, never confirmed).
 * In this environment's Redis namespace only: the rate-limit counters, so a run does not start
 * inside the previous run's window.
 *
 * Refuses unless `DATABASE_URL` is a loopback host: the name patterns are broad enough that they
 * must never run against a shared database.
 *
 * Usage (setup-loadtest.sh runs it with the load-test environment, so the Redis namespace matches
 * the cluster's):
 *   pnpm load:reset
 */
import '@/shared/config/load-env-files.js';
import '@/scripts/seed/seed-runtime-url.js';
import { and, eq, inArray, isNull, like, or } from 'drizzle-orm';
import { closeRedis, connectRedis, redisConnection } from '@/infrastructure/cache/redis.client.js';
import { scanLogicalKeys } from '@/infrastructure/cache/redis-scan.util.js';
import { closeDatabase } from '@/infrastructure/database/connection.js';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { isLocalDatabaseUrl } from '@/infrastructure/database/utils/connection-url.util.js';
import { roles } from '@/domains/tenancy/sub-domains/member-roles/member-role.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { uploads } from '@/domains/upload/upload.schema.js';
import { RATE_LIMIT_KEY_PREFIX } from '@/shared/middlewares/rate-limit/rate-limit-fallback-store.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { parseCommandLine } from '@tooling/setup/common/script.js';

parseCommandLine({ args: process.argv.slice(2) });

/** Role names `scenarios/comprehensive-journey.js` creates (and deletes when an iteration finishes). */
const JOURNEY_ROLE_NAME_PATTERNS = ['Role %', 'Member Role %'];

async function deleteLeakedJourneyRows(): Promise<void> {
  const database = getRequestDatabase();
  const leakedRoleIds = database
    .select({ id: roles.id })
    .from(roles)
    .where(or(...JOURNEY_ROLE_NAME_PATTERNS.map((pattern) => like(roles.name, pattern))));

  const deletedMemberships = await database
    .delete(memberships)
    .where(inArray(memberships.role_id, leakedRoleIds))
    .returning({ id: memberships.id });
  const deletedRoles = await database
    .delete(roles)
    .where(inArray(roles.id, leakedRoleIds))
    .returning({ id: roles.id });
  const deletedUploads = await database
    .delete(uploads)
    .where(and(eq(uploads.status, 'PENDING'), isNull(uploads.deleted_at)))
    .returning({ id: uploads.id });

  logger.info(
    {
      memberships: deletedMemberships.length,
      roles: deletedRoles.length,
      pendingUploads: deletedUploads.length,
    },
    'load-test-reset: leaked journey rows deleted',
  );
}

async function deleteRateLimitCounters(): Promise<void> {
  await connectRedis();
  let deleted = 0;
  for await (const keys of scanLogicalKeys({
    redis: redisConnection,
    logicalPattern: `${RATE_LIMIT_KEY_PREFIX}*`,
  })) {
    deleted += await redisConnection.del(...keys);
  }
  logger.info(
    { keyPrefix: redisConnection.options.keyPrefix, deleted },
    'load-test-reset: rate-limit counters deleted',
  );
}

async function run(): Promise<void> {
  if (!isLocalDatabaseUrl(process.env.DATABASE_URL)) {
    throw new Error(
      'Refusing to reset: DATABASE_URL is not a loopback host. The load-test reset deletes rows ' +
        'by name pattern and only ever runs against the local database.',
    );
  }
  await deleteLeakedJourneyRows();
  await deleteRateLimitCounters();
}

run()
  .catch((error) => {
    logger.error({ error }, 'load-test-reset: failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
    await closeRedis();
  });
