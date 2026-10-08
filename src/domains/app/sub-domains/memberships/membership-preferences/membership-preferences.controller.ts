import type { FastifyReply, FastifyRequest } from 'fastify';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { hasOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { successResponse } from '@/shared/utils/http/response.util.js';
import {
  getActingUserPublicId,
  getRequestIdentifier,
  requireOrganizationScope,
  requirePrincipal,
} from '@/shared/utils/http/request.util.js';
import type { MembershipPreferencesService } from './membership-preferences.service.js';

/** HTTP handlers for `GET`/`PATCH /app/memberships/me/preferences` — the caller's own settings. */
export function createMembershipPreferencesController(service: MembershipPreferencesService) {
  return {
    getMine: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await service.getMine(
        requireOrganizationScope(request),
        getActingUserPublicId(requirePrincipal(request)),
      );
      return successResponse(data, getRequestIdentifier(request));
    },
    updateMine: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await service.updateMine(requireOrganizationScope(request), request.body, {
        actingUserPublicId: getActingUserPublicId(requirePrincipal(request)),
        // "See every branch" (`branch:read`) lets the filter name any branch; others name their own.
        allBranches: await hasOrganizationPermission(request, APP_PERMISSIONS.BRANCH_READ),
      });
      return successResponse(data, getRequestIdentifier(request));
    },
  };
}
