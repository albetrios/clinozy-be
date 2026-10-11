import type { FastifyReply, FastifyRequest } from 'fastify';
import { toSupportedLanguage } from '@/shared/constants/i18n.constants.js';
import { ForbiddenError } from '@/shared/errors/index.js';
import { successResponse } from '@/shared/utils/http/response.util.js';
import { getRequestIdentifier, requireAuth } from '@/shared/utils/http/request.util.js';
import { recordScopedAuditEvent } from '@/shared/utils/infrastructure/audit-request-context.util.js';
import { redisConnection } from '@/infrastructure/cache/redis.client.js';
import { recordRecentStepUp, type StepUpFactor } from '@/shared/utils/auth/recent-step-up.util.js';
import {
  getIpAddress,
  resolveAuthMessageKeyResponse,
  setSessionCookie,
} from '@/domains/auth/auth.http.util.js';
import { getUserAgent } from '@/shared/utils/http/user-agent.util.js';
import { recordLoginAuditEvent } from '@/domains/auth/shared/audit-login.util.js';
import {
  validateAuthMethodPublicIdParam,
  validateStepUpVerify,
} from '@/domains/auth/auth.validator.js';
import { AuthSerializer } from '@/domains/auth/auth.serializer.js';
import type { AuthContainer } from '@/domains/auth/auth.container.js';

type AuthAuthMethodHandlersDependencies = Pick<
  AuthContainer,
  'authMethodService' | 'authService' | 'emailLoginService'
>;

/** Builds the auth-method management Fastify handlers (`listAuthMethods`, `createAuthMethod`, `deleteAuthMethod`, plus the password + email-code step-up flows) and emits the `auth.auth_method.*` audit events. Reset-password auto-logs-in via {@link AuthContainer.authService}. */
export function createAuthAuthMethodHandlers({
  authMethodService,
  authService,
  emailLoginService,
}: AuthAuthMethodHandlersDependencies) {
  return {
    listAuthMethods: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requireAuth(request);
      const data = await authMethodService.list(auth.userId);
      return successResponse({
        data: AuthSerializer.authMethodList(data),
        request_id: getRequestIdentifier(request),
      });
    },
    createAuthMethod: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requireAuth(request);
      const data = await authMethodService.create({
        userPublicId: auth.userId,
        body: request.body,
      });
      await recordScopedAuditEvent({
        request,
        input: {
          actorUserPublicId: auth.userId,
          action: 'auth.auth_method.create',
          resource_type: 'auth_method',
          metadata: { auth_method_id: (data as { public_id?: string }).public_id },
        },
      });
      return successResponse({
        data: AuthSerializer.authMethod(data),
        request_id: getRequestIdentifier(request),
      });
    },
    deleteAuthMethod: async (
      request: FastifyRequest<{ Params: { auth_method_id: string } }>,
      reply: FastifyReply,
    ) => {
      const auth = requireAuth(request);
      const publicId = validateAuthMethodPublicIdParam(request.params.auth_method_id);
      await authMethodService.delete({ userPublicId: auth.userId, methodPublicId: publicId });
      await recordScopedAuditEvent({
        request,
        input: {
          actorUserPublicId: auth.userId,
          action: 'auth.auth_method.delete',
          resource_type: 'auth_method',
          metadata: { auth_method_id: publicId },
        },
      });
      return reply.code(204).send();
    },
    forgotPassword: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await authMethodService.forgotPassword({
        body: request.body,
        context: {
          requestId: getRequestIdentifier(request),
          locale: toSupportedLanguage(request.language),
        },
      });
      return successResponse({
        data: resolveAuthMessageKeyResponse({ request, data }),
        request_id: getRequestIdentifier(request),
      });
    },
    resetPassword: async (request: FastifyRequest, reply: FastifyReply) => {
      const ipAddress = getIpAddress(request);
      const userAgent = getUserAgent(request) ?? undefined;
      const { userPublicId, loginResult: data } = await authService.resetPassword({
        body: request.body,
        ipAddress,
        userAgent,
      });

      // A completed reset is a credential change — record it DISTINCTLY (and at WARNING) from the
      // subsequent login so a reset is queryable on its own (previously it surfaced only as
      // auth.login). Recorded for both the MFA-required and auto-login branches, attributed to the
      // reset user (without an actor the audit service dropped every one of these rows).
      await recordScopedAuditEvent({
        request,
        input: {
          actorUserPublicId: userPublicId,
          action: 'auth.password.reset',
          resource_type: 'user',
          severity: 'WARNING',
        },
      });

      // MFA users complete the second factor before a session is issued (the reset never bypasses MFA).
      if ('mfa_required' in data) {
        return successResponse({
          data: AuthSerializer.mfaRequired(data),
          request_id: getRequestIdentifier(request),
        });
      }

      // Auto-login: the reset revoked every prior session, so this freshly-minted one is the only
      // live session — the user lands logged in instead of being bounced to the sign-in page.
      setSessionCookie({
        reply,
        sessionPublicId: data.session_public_id,
        refreshSecret: data.session_refresh_secret,
      });
      // sec-A8: a reset auto-login is a login surface — audit it like password / email-code / OAuth.
      await recordLoginAuditEvent({ request, loginResult: data, source: 'password' });
      return successResponse({
        data: AuthSerializer.accessToken(data),
        request_id: getRequestIdentifier(request),
      });
    },
    stepUp: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requireAuth(request);
      const parsed = validateStepUpVerify(request.body);
      let factor: StepUpFactor;
      if ('password' in parsed) {
        await authMethodService.verifyPasswordForStepUp({
          userPublicId: auth.userId,
          password: parsed.password,
        });
        factor = 'password';
      } else {
        // Bootstrap-only email-code step-up: the service rejects it for accounts that have a
        // password or MFA, so this branch only ever succeeds for a passwordless-no-MFA account.
        // The resulting window is `email_code`-tagged — it can enroll a first factor but never
        // satisfy the strong gate on destructive mutations.
        await emailLoginService.verifyCodeForStepUp({
          userPublicId: auth.userId,
          code: parsed.code,
        });
        factor = 'email_code';
      }
      // Step-up sentinel is per-(user, session) (sec-A2); fail closed if session id is missing.
      if (!auth.sessionPublicId) {
        throw new ForbiddenError('errors:recentStepUpRequired');
      }
      await recordRecentStepUp({
        redis: redisConnection,
        userPublicId: auth.userId,
        sessionPublicId: auth.sessionPublicId,
        factor,
      });
      await recordScopedAuditEvent({
        request,
        input: {
          actorUserPublicId: auth.userId,
          action: 'auth.step_up',
          resource_type: 'user',
          metadata: { factor },
        },
      });
      return successResponse({
        data: { stepped_up: true },
        request_id: getRequestIdentifier(request),
      });
    },
    changePassword: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request);
      const currentAccessToken = request.headers.authorization?.match(/^Bearer\s+(\S.*)$/i)?.[1];
      await authMethodService.changePassword({
        userPublicId: auth.userId,
        body: request.body,
        options: currentAccessToken ? { currentAccessToken } : undefined,
      });
      await recordScopedAuditEvent({
        request,
        input: {
          actorUserPublicId: auth.userId,
          action: 'auth.password.change',
          resource_type: 'user',
        },
      });
      return reply.code(204).send();
    },
  };
}
