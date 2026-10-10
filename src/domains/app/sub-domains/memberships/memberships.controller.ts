import type { FastifyReply, FastifyRequest } from 'fastify';
import { paginatedResponse } from '@/shared/utils/http/response.util.js';
import {
  getRequestIdentifier,
  requireOrganizationScope,
} from '@/shared/utils/http/request.util.js';
import type { AppMembershipsService } from './memberships.service.js';

/**
 * HTTP handlers for `GET /app/memberships` — the team picker and member directory — and
 * `GET /app/roles`, the role directory beside it.
 */
export function createAppMembershipsController(service: AppMembershipsService) {
  return {
    list: async (request: FastifyRequest, _reply: FastifyReply) => {
      const result = await service.list(requireOrganizationScope(request), request.query);
      return paginatedResponse(result.items, getRequestIdentifier(request), {
        per_page: result.limit,
        next: result.next_cursor,
        has_more: result.has_more,
      });
    },
    listRoles: async (request: FastifyRequest, _reply: FastifyReply) => {
      const result = await service.listRoles(requireOrganizationScope(request), request.query);
      return paginatedResponse(result.items, getRequestIdentifier(request), {
        per_page: result.limit,
        next: result.next_cursor,
        has_more: result.has_more,
      });
    },
  };
}
