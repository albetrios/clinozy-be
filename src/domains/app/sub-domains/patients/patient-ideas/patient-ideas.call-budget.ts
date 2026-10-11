import { redisConnection } from '@/infrastructure/cache/redis.client.js';
import { env } from '@/shared/config/env.config.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/** How long a day's counter lives — past its day, so a late run on either side still reads it. */
const CALL_BUDGET_TTL_SECONDS = 2 * 24 * 60 * 60;

/**
 * Atomic "under the limit? then count one": the day's count, or `-1` when the limit is reached
 * (a GET-then-INCR from TypeScript would let two runs both pass at the limit).
 */
const RESERVE_CALL_LUA = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= tonumber(ARGV[1]) then
  return -1
end
local next_count = redis.call('INCR', KEYS[1])
if next_count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return next_count
`;

/** The organization's counter for the UTC day of `now`. */
export function ideasCallBudgetKey({
  organizationPublicId,
  now = new Date(),
}: {
  organizationPublicId: string;
  now?: Date | undefined;
}): string {
  return `patient-ideas:calls:${organizationPublicId}:${now.toISOString().slice(0, 10)}`;
}

/**
 * The ideas worker's cost guard (task I4, launch D80): takes one Claude call from the
 * organization's daily budget (`PATIENT_IDEAS_DAILY_CALL_LIMIT`, per UTC day); false when the day's
 * budget is spent.
 *
 * @remarks
 * - **Algorithm:** one Lua check-and-increment on the app Redis (`patient-ideas:calls:<org>:<day>`,
 *   kept two days).
 * - **Failure modes:** a Redis error answers false — fail closed: no call is made without a
 *   counted budget, and the patients wait, still marked (logged `patient-ideas.call_budget_unavailable`).
 */
export async function reserveIdeasCall(organizationPublicId: string): Promise<boolean> {
  try {
    const result = await redisConnection.eval(
      RESERVE_CALL_LUA,
      1,
      ideasCallBudgetKey({ organizationPublicId }),
      String(env.PATIENT_IDEAS_DAILY_CALL_LIMIT),
      String(CALL_BUDGET_TTL_SECONDS),
    );
    return typeof result === 'number' && result > 0;
  } catch (error) {
    logger.warn({ error, organizationPublicId }, 'patient-ideas.call_budget_unavailable');
    return false;
  }
}
