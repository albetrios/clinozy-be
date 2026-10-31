import type { FastifyReply, FastifyRequest } from 'fastify';
import { ForbiddenError } from '@/shared/errors/index.js';
import { redisConnection } from '@/infrastructure/cache/redis.client.js';
import { requireAuth } from '@/shared/utils/http/request.util.js';
import { hasRecentStepUp, hasRecentStrongStepUp } from '@/shared/utils/auth/recent-step-up.util.js';

/**
 * PreHandler that requires the caller to have completed step-up authentication (e.g. MFA verify)
 * within the last ten minutes — on THIS session — before mutating credentials or MFA enrollment.
 *
 * @remarks
 * The check is bound to `(userPublicId, sessionPublicId)` so a stolen-session attacker
 * cannot inherit a step-up that the legitimate user performed on a different session
 * (sec-A2). Fails closed when `sessionPublicId` is absent on `request.auth`.
 */
export async function requireRecentStepUpPreHandler(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const auth = requireAuth(request);
  const steppedUp = await hasRecentStepUp({
    redis: redisConnection,
    userPublicId: auth.userId,
    sessionPublicId: auth.sessionPublicId,
  });
  if (!steppedUp) {
    throw new ForbiddenError('errors:recentStepUpRequired');
  }
}

/**
 * PreHandler factory: {@link requireRecentStepUpPreHandler}, but only when the request body
 * carries `field` — for a route where one field alone is the sensitive part (an organization's
 * `status`, B2-3) and the rest of the body is routine.
 *
 * @remarks
 * - **Algorithm:** a body without `field` (or with it `undefined`) passes; otherwise a user must
 *   hold a recent step-up on this session. An API key can never step up, so it is refused.
 * - **Failure modes:** `ForbiddenError('errors:recentStepUpRequired')`.
 * - **Notes:** runs as a preHandler, so the body is already parsed and validated.
 */
export function requireRecentStepUpWhenBodyHas(
  field: string,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const body = request.body;
    if (!(body && typeof body === 'object')) return;
    if ((body as Record<string, unknown>)[field] === undefined) return;
    if (request.auth?.kind !== 'user') {
      throw new ForbiddenError('errors:recentStepUpRequired');
    }
    await requireRecentStepUpPreHandler(request, reply);
  };
}

/**
 * PreHandler for DESTRUCTIVE credential/session mutations (revoke sessions, delete an MFA method,
 * passkey, or auth-method) — requires a recent step-up completed via a STRONG factor
 * (password or MFA), on THIS session, within the last ten minutes.
 *
 * @remarks
 * Stricter than {@link requireRecentStepUpPreHandler}: a bootstrap `email_code` step-up (a
 * passwordless account enrolling its first factor) opens a window that can ENROLL but must not
 * REVOKE/DELETE. Enroll routes use the weaker gate; destructive routes use this one, so a stolen
 * session + inbox on a passwordless account cannot revoke the victim's sessions or credentials.
 * Fails closed when `sessionPublicId` is absent on `request.auth`.
 */
export async function requireStrongRecentStepUpPreHandler(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const auth = requireAuth(request);
  const steppedUp = await hasRecentStrongStepUp({
    redis: redisConnection,
    userPublicId: auth.userId,
    sessionPublicId: auth.sessionPublicId,
  });
  if (!steppedUp) {
    throw new ForbiddenError('errors:strongStepUpRequired');
  }
}
