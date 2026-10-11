import type { FastifyReply, FastifyRequest } from 'fastify';
import { paginatedResponse, successResponse } from '@/shared/utils/http/response.util.js';
import {
  getActingUserPublicId,
  getRequestIdentifier,
  requireOrganizationScope,
  requirePrincipal,
} from '@/shared/utils/http/request.util.js';
import { validatePublicIdParam } from '@/shared/utils/identity/public-id-param.util.js';
import { validateListMemberRolesQuery } from './member-role.validator.js';
import {
  buildAuditActorFields,
  recordScopedAuditEvent,
} from '@/shared/utils/infrastructure/audit-request-context.util.js';
import type { MemberRoleService } from './member-role.service.js';

/**
 * Builds the HTTP handler map for the organization role CRUD endpoints under
 * `/organization/roles`. Mutating handlers also record a scoped audit
 * event via {@link recordScopedAuditEvent} so role lifecycle changes appear in
 * the audit log.
 */
export function createMemberRoleController(service: MemberRoleService) {
  return {
    listRoles: async (request: FastifyRequest, _reply: FastifyReply) => {
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      const pagination = validateListMemberRolesQuery(request.query);
      const result = await service.list({ scope, pagination });
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
    getRole: async (request: FastifyRequest, _reply: FastifyReply) => {
      const { role_id: rawRoleId } = (request.params as {
        role_id: string;
      }) ?? { role_id: '' };
      // sec-new-T3: reject malformed path params before reaching the service layer.
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      const roleId = validatePublicIdParam({ value: rawRoleId ?? '', fieldName: 'role_id' });
      const data = await service.getByPublicId({ scope, role_public_id: roleId });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    createRole: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const organizationId = scope.organizationPublicId;
      const data = await service.create({
        scope,
        body: request.body,
        created_by_user_public_id: getActingUserPublicId(auth),
      });
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'tenancy.role.create',
          resource_type: 'role',
          organizationPublicId: organizationId,
          metadata: { role_public_id: data.id },
        },
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    updateRole: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const { role_id: rawUpdateRoleId } = (request.params as {
        role_id: string;
      }) ?? { role_id: '' };
      // sec-new-T3: reject malformed path params before reaching the service layer.
      const scope = requireOrganizationScope(request);
      const organizationId = scope.organizationPublicId;
      const roleId = validatePublicIdParam({ value: rawUpdateRoleId ?? '', fieldName: 'role_id' });
      const data = await service.update({
        scope,
        role_public_id: roleId,
        body: request.body,
        updated_by_user_public_id: getActingUserPublicId(auth),
      });
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'tenancy.role.update',
          resource_type: 'role',
          organizationPublicId: organizationId,
          metadata: { role_public_id: roleId },
        },
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    deleteRole: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const { role_id: rawDeleteRoleId } = (request.params as {
        role_id: string;
      }) ?? { role_id: '' };
      // sec-new-T3: reject malformed path params before reaching the service layer.
      const scope = requireOrganizationScope(request);
      const organizationId = scope.organizationPublicId;
      const roleId = validatePublicIdParam({ value: rawDeleteRoleId ?? '', fieldName: 'role_id' });
      await service.delete({ scope, role_public_id: roleId });
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'tenancy.role.delete',
          resource_type: 'role',
          organizationPublicId: organizationId,
          metadata: { role_public_id: roleId },
        },
      });
      return reply.code(204).send();
    },
  };
}
