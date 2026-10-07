// hand-edited — the singleton preference handlers.
import type { FastifyReply, FastifyRequest } from 'fastify';
import { successResponse } from '@/shared/utils/http/response.util.js';
import {
  getActingUserPublicId,
  getRequestIdentifier,
  requireOrganizationScope,
  requirePrincipal,
} from '@/shared/utils/http/request.util.js';
import type { UserPreferencesService } from './user-preferences.service.js';

/** HTTP handlers for `GET`/`PATCH /app/user-preferences` — the caller's own settings. */
export function createUserPreferencesController(service: UserPreferencesService) {
  return {
    getMine: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await service.getMine(
        requireOrganizationScope(request),
        getActingUserPublicId(requirePrincipal(request)),
      );
      return successResponse(data, getRequestIdentifier(request));
    },
    updateMine: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await service.updateMine(
        requireOrganizationScope(request),
        request.body,
        getActingUserPublicId(requirePrincipal(request)),
      );
      return successResponse(data, getRequestIdentifier(request));
    },
  };
}
