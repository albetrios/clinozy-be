import type { FastifyReply, FastifyRequest } from 'fastify';
import { successResponse } from '@/shared/utils/http/response.util.js';
import {
  getRequestIdentifier,
  requireOrganizationScope,
} from '@/shared/utils/http/request.util.js';
import type { AppUsersService } from './users.service.js';

/** HTTP handlers for `GET /app/users` — the team, filtered by role and branch. */
export function createAppUsersController(service: AppUsersService) {
  return {
    list: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await service.list(requireOrganizationScope(request), request.query);
      return successResponse(data, getRequestIdentifier(request));
    },
  };
}
