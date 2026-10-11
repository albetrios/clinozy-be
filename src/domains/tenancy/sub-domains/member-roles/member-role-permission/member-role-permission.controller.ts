import type { FastifyReply, FastifyRequest } from 'fastify';
import { paginatedResponse, successResponse } from '@/shared/utils/http/response.util.js';
import {
  getActingUserPublicId,
  getRequestIdentifier,
  requireOrganizationScope,
  requirePrincipal,
} from '@/shared/utils/http/request.util.js';
import {
  buildAuditActorFields,
  recordScopedAuditEvent,
} from '@/shared/utils/infrastructure/audit-request-context.util.js';
import type { MemberRolePermissionService } from './member-role-permission.service.js';
import { serializeMemberRolePermission } from './member-role-permission.serializer.js';

/**
 * Builds the HTTP handler map for role-to-permission assignment endpoints
 * (`GET /organization/roles/:role_id/permissions` and the matching `PUT`).
 * Resolves the active organization from the signed JWT `org` claim and the
 * role public id from the path param, then forwards to
 * {@link MemberRolePermissionService}. A replacement records the new permission set in the
 * organization's audit log.
 */
export function createMemberRolePermissionController(service: MemberRolePermissionService) {
  return {
    listRolePermissions: async (request: FastifyRequest, _reply: FastifyReply) => {
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      const { role_id: roleId } = request.params as { role_id: string };
      const rows = await service.list({ scope, role_public_id: roleId });
      const data = rows.map((row) => serializeMemberRolePermission(row, roleId));
      return paginatedResponse(data, getRequestIdentifier(request), {
        per_page: data.length,
        next: null,
        has_more: false,
        estimated_total: data.length,
      });
    },
    putRolePermissions: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      const { role_id: roleId } = request.params as { role_id: string };
      const rows = await service.put({
        scope,
        role_public_id: roleId,
        body: request.body,
        created_by_user_public_id: getActingUserPublicId(auth),
      });
      const data = rows.map((row) => serializeMemberRolePermission(row, roleId));
      await recordScopedAuditEvent(request, {
        ...buildAuditActorFields(auth),
        action: 'tenancy.role_permissions.put',
        resource_type: 'role',
        organizationPublicId: scope.organizationPublicId,
        metadata: {
          role_public_id: roleId,
          permission_codes: data.map((permission) => permission.permission_code),
        },
      });
      return successResponse(data, getRequestIdentifier(request));
    },
  };
}
