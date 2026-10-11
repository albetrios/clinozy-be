import type { FastifyReply, FastifyRequest } from 'fastify';
import { translateMessageKeyPayload } from '@/shared/utils/i18n/i18n-response.util.js';
import { successResponse } from '@/shared/utils/http/response.util.js';
import { getRequestIdentifier } from '@/shared/utils/http/request.util.js';
import { toSupportedLanguage } from '@/shared/constants/i18n.constants.js';
import { getIpAddress, setSessionCookie } from '@/domains/auth/auth.http.util.js';
import { getUserAgent } from '@/shared/utils/http/user-agent.util.js';
import { AuthSerializer } from '@/domains/auth/auth.serializer.js';
import {
  recordLoginAuditEvent,
  recordLoginFailureAuditEvent,
} from '@/domains/auth/shared/audit-login.util.js';
import type { AuthContainer } from '@/domains/auth/auth.container.js';

type AuthEmailLoginHandlersDependencies = Pick<AuthContainer, 'emailLoginService'>;

/** Builds the email verification-code Fastify handlers: `sendEmailCode` (enqueues the `AUTH_EVENT.EMAIL_VERIFICATION_CODE_REQUESTED` email) and `emailLogin` (consumes the code, mints a session, sets the cookie). */
export function createAuthEmailLoginHandlers({
  emailLoginService,
}: AuthEmailLoginHandlersDependencies) {
  return {
    sendEmailCode: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await emailLoginService.sendCode({
        body: request.body,
        context: {
          requestId: getRequestIdentifier(request),
          locale: toSupportedLanguage(request.language),
        },
      });
      const translated = translateMessageKeyPayload({ request, payload: data });
      return successResponse({
        data: AuthSerializer.verificationCodeSent({
          message: translated.message,
          expires_in_minutes: data.expires_in_minutes,
          ...(data.debug_verification_code
            ? { debug_verification_code: data.debug_verification_code }
            : {}),
        }),
        request_id: getRequestIdentifier(request),
      });
    },
    emailLogin: async (request: FastifyRequest, reply: FastifyReply) => {
      const ipAddress = getIpAddress(request);
      const userAgent = getUserAgent(request) ?? undefined;
      let data: Awaited<ReturnType<typeof emailLoginService.login>>;
      try {
        data = await emailLoginService.login({ body: request.body, ipAddress, userAgent });
      } catch (error) {
        // sec-A8 follow-up: record the failure side of the auth.overview.md invariant.
        await recordLoginFailureAuditEvent({ request, source: 'email_code', error });
        throw error;
      }

      if ('mfa_required' in data) {
        return successResponse({
          data: AuthSerializer.mfaRequired(data),
          request_id: getRequestIdentifier(request),
        });
      }

      if (
        'session_public_id' in data &&
        typeof data.session_public_id === 'string' &&
        'session_refresh_secret' in data &&
        typeof data.session_refresh_secret === 'string'
      ) {
        setSessionCookie({
          reply,
          sessionPublicId: data.session_public_id,
          refreshSecret: data.session_refresh_secret,
        });
        // sec-A8: audit every login surface, not just password login.
        if ('access_token' in data && typeof data.access_token === 'string') {
          await recordLoginAuditEvent({
            request,
            loginResult: {
              access_token: data.access_token,
              session_public_id: data.session_public_id,
            },
            source: 'email_code',
          });
        }
      }

      return successResponse({
        data: AuthSerializer.accessToken(data),
        request_id: getRequestIdentifier(request),
      });
    },
  };
}
