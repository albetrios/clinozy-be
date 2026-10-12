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
      const data = await service.list({
        scope: requireOrganizationScope(request),
        branchPublicId: validatePublicIdParam({
          value: request.params.branch_id,
          fieldName: 'branch_id',
        }),
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    replaceBranchMembers: async (request: FastifyRequest<BranchParams>, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const branchId = validatePublicIdParam({
        value: request.params.branch_id,
        fieldName: 'branch_id',
      });
      const data = await service.replace({
        scope,
        branchPublicId: branchId,
        body: request.body,
        actingUserPublicId: getActingUserPublicId(auth),
      });
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'app.branch.members.replace',
          resource_type: 'branch',
          organizationPublicId: scope.organizationPublicId,
          severity: 'WARNING',
          metadata: { branch_public_id: branchId, membership_count: data.length },
        },
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
  };
}
