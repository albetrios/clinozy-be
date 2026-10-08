import type { FastifyReply, FastifyRequest } from 'fastify';
import { successResponse } from '@/shared/utils/http/response.util.js';
import {
  getActingUserPublicId,
  getRequestIdentifier,
  requireOrganizationScope,
  requirePrincipal,
} from '@/shared/utils/http/request.util.js';
import { validatePublicIdParam } from '@/shared/utils/identity/public-id-param.util.js';
import {
  buildAuditActorFields,
  recordScopedAuditEvent,
} from '@/shared/utils/infrastructure/audit-request-context.util.js';
import type { BranchMembersService } from './branch-members.service.js';

type BranchParams = { Params: { branch_id: string } };

/** HTTP handlers for `/app/branches/{branch_id}/members`. */
export function createBranchMembersController(service: BranchMembersService) {
  return {
    listBranchMembers: async (request: FastifyRequest<BranchParams>, _reply: FastifyReply) => {
      const data = await service.list(
        requireOrganizationScope(request),
        validatePublicIdParam(request.params.branch_id, 'branch_id'),
      );
      return successResponse(data, getRequestIdentifier(request));
    },
    replaceBranchMembers: async (request: FastifyRequest<BranchParams>, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const branchId = validatePublicIdParam(request.params.branch_id, 'branch_id');
      const data = await service.replace(
        scope,
        branchId,
        request.body,
        getActingUserPublicId(auth),
      );
      await recordScopedAuditEvent(request, {
        ...buildAuditActorFields(auth),
        action: 'app.branch.members.replace',
        resource_type: 'branch',
        organizationPublicId: scope.organizationPublicId,
        severity: 'WARNING',
        metadata: { branch_public_id: branchId, membership_count: data.length },
      });
      return successResponse(data, getRequestIdentifier(request));
    },
  };
}
