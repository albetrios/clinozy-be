import type { FastifyReply, FastifyRequest } from 'fastify';
import { paginatedResponse, successResponse } from '@/shared/utils/http/response.util.js';
import {
  getActingUserPublicId,
  getRequestIdentifier,
  requireOrganizationScope,
  requirePrincipal,
} from '@/shared/utils/http/request.util.js';
import type { MembershipSavedViewsService } from './membership-saved-views.service.js';

type SavedViewParams = { Params: { membership_saved_view_id: string } };

/** HTTP handlers for `/app/memberships/me/saved-views` — the caller's own saved views. */
export function createMembershipSavedViewsController(service: MembershipSavedViewsService) {
  const actor = (request: FastifyRequest) => getActingUserPublicId(requirePrincipal(request));
  return {
    list: async (request: FastifyRequest, _reply: FastifyReply) => {
      const result = await service.list(
        requireOrganizationScope(request),
        request.query,
        actor(request),
      );
      return paginatedResponse(result.items, getRequestIdentifier(request), {
        per_page: result.limit,
        next: result.next_cursor,
        has_more: result.has_more,
        ...(result.total !== null ? { estimated_total: result.total } : {}),
      });
    },
    create: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await service.create(
        requireOrganizationScope(request),
        request.body,
        actor(request),
      );
      return successResponse(data, getRequestIdentifier(request));
    },
    get: async (request: FastifyRequest<SavedViewParams>, _reply: FastifyReply) => {
      const data = await service.get(
        requireOrganizationScope(request),
        request.params.membership_saved_view_id,
        actor(request),
      );
      return successResponse(data, getRequestIdentifier(request));
    },
    update: async (request: FastifyRequest<SavedViewParams>, _reply: FastifyReply) => {
      const data = await service.update(
        requireOrganizationScope(request),
        request.params.membership_saved_view_id,
        request.body,
        actor(request),
      );
      return successResponse(data, getRequestIdentifier(request));
    },
    remove: async (request: FastifyRequest<SavedViewParams>, reply: FastifyReply) => {
      await service.remove(
        requireOrganizationScope(request),
        request.params.membership_saved_view_id,
        actor(request),
      );
      return reply.code(204).send();
    },
  };
}
