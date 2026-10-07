import type { FastifyReply, FastifyRequest } from 'fastify';
import { successResponse } from '@/shared/utils/http/response.util.js';
import {
  getActingUserPublicId,
  getRequestIdentifier,
  requireOrganizationScope,
  requirePrincipal,
} from '@/shared/utils/http/request.util.js';
import { validatePublicIdParam } from '@/shared/utils/identity/public-id-param.util.js';
import { hasOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import {
  buildAuditActorFields,
  listBodyFieldNames,
  recordScopedAuditEvent,
} from '@/shared/utils/infrastructure/audit-request-context.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { BranchesService } from './branches.service.js';
import { validateListBranchesQuery } from './branches.validator.js';

type BranchParams = { Params: { branch_id: string } };

/**
 * HTTP handlers for `/app/branches` — they coordinate (scope, ids, audit) and leave every rule
 * to {@link BranchesService}.
 */
export function createBranchesController(service: BranchesService) {
  return {
    listMyBranches: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const data = await service.listMine({
        scope: requireOrganizationScope(request),
        userPublicId: getActingUserPublicId(auth),
        canReadAllBranches: await hasOrganizationPermission(request, APP_PERMISSIONS.BRANCH_READ),
      });
      return successResponse(data, getRequestIdentifier(request));
    },
    listBranches: async (request: FastifyRequest, _reply: FastifyReply) => {
      const query = validateListBranchesQuery(request.query);
      const data = await service.list({
        scope: requireOrganizationScope(request),
        includeInactive: query.include_inactive === 'true',
      });
      return successResponse(data, getRequestIdentifier(request));
    },
    getBranch: async (request: FastifyRequest<BranchParams>, _reply: FastifyReply) => {
      const data = await service.get(
        requireOrganizationScope(request),
        validatePublicIdParam(request.params.branch_id, 'branch_id'),
      );
      return successResponse(data, getRequestIdentifier(request));
    },
    createBranch: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const data = await service.create(scope, request.body, getActingUserPublicId(auth));
      await recordScopedAuditEvent(request, {
        ...buildAuditActorFields(auth),
        action: 'app.branch.create',
        resource_type: 'branch',
        organizationPublicId: scope.organizationPublicId,
        metadata: { branch_public_id: data.id },
      });
      return successResponse(data, getRequestIdentifier(request));
    },
    updateBranch: async (request: FastifyRequest<BranchParams>, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const branchId = validatePublicIdParam(request.params.branch_id, 'branch_id');
      const data = await service.update(scope, branchId, request.body, getActingUserPublicId(auth));
      await recordScopedAuditEvent(request, {
        ...buildAuditActorFields(auth),
        action: 'app.branch.update',
        resource_type: 'branch',
        organizationPublicId: scope.organizationPublicId,
        metadata: { branch_public_id: branchId, changed_fields: listBodyFieldNames(request.body) },
      });
      return successResponse(data, getRequestIdentifier(request));
    },
  };
}
