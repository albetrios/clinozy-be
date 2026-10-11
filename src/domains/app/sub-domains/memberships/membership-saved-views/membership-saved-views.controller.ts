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
      const result = await service.list({
        scope: requireOrganizationScope(request),
        query: request.query,
        actingUserPublicId: actor(request),
      });
      return paginatedResponse({
        data: result.items,
        request_id: getRequestIdentifier(request),
        pagination: {
          per_page: result.limit,
          next: result.next_cursor,
          has_more: result.has_more,
          ...(result.total !== null ? { estimated_total: result.total } : {}),
        },
      });
    },
    create: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await service.create({
        scope: requireOrganizationScope(request),
        body: request.body,
        actingUserPublicId: actor(request),
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    get: async (request: FastifyRequest<SavedViewParams>, _reply: FastifyReply) => {
      const data = await service.get({
        scope: requireOrganizationScope(request),
        savedViewPublicId: request.params.membership_saved_view_id,
        actingUserPublicId: actor(request),
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    update: async (request: FastifyRequest<SavedViewParams>, _reply: FastifyReply) => {
      const data = await service.update({
        scope: requireOrganizationScope(request),
        savedViewPublicId: request.params.membership_saved_view_id,
        body: request.body,
        actingUserPublicId: actor(request),
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    remove: async (request: FastifyRequest<SavedViewParams>, reply: FastifyReply) => {
      await service.remove({
        scope: requireOrganizationScope(request),
        savedViewPublicId: request.params.membership_saved_view_id,
        actingUserPublicId: actor(request),
      });
      return reply.code(204).send();
    },
  };
}
