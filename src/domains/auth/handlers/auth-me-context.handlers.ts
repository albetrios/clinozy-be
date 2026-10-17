import type { FastifyReply, FastifyRequest } from 'fastify';
import { successResponse } from '@/shared/utils/http/response.util.js';
import {
  getRequestIdentifier,
  requireAuth,
  requireUserScope,
} from '@/shared/utils/http/request.util.js';
import { serializeAuthMeContext } from '@/domains/auth/auth-me-context.serializer.js';
import type { AuthContainer } from '@/domains/auth/auth.container.js';

type AuthMeContextHandlersDependencies = Pick<AuthContainer, 'authMeContextService'>;

/** Builds the `GET /auth/me/context` handler — the single authoritative call returning the caller's identity, active organization (with its `type` and `plan_access`), membership and roles there, resolved permissions, and global role. */
export function createAuthMeContextHandlers({
  authMeContextService,
}: AuthMeContextHandlersDependencies) {
  return {
    getMeContext: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requireAuth(request);
      const data = await authMeContextService.getContext({
        scope: requireUserScope(request),
        globalRole: auth.role,
      });
      return successResponse({
        data: serializeAuthMeContext(data),
        request_id: getRequestIdentifier(request),
      });
    },
  };
}
