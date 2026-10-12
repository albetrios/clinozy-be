import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { BranchMembersService } from './branch-members.service.js';
import { createBranchMembersController } from './branch-members.controller.js';
import { branchMembersParamsDto, ReplaceBranchMembersDto } from './branch-members.dto.js';

/** Registers the `/app/branches/{branch_id}/members` routes (prefix `/api/v1/app`). */
export function branchMembersRoutes(service: BranchMembersService): FastifyPluginAsync {
  const controller = createBranchMembersController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { branch_id: string } }>(
      '/branches/:branch_id/members',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List branch members',
          description:
            'Returns who works at the branch (team member ids), oldest first; an ended member is not listed (their row comes back with a restore). Requires branch:update.',
          tags: ['Branch'],
          params: branchMembersParamsDto,
        },
      },
      controller.listBranchMembers,
    );
    zodApplication.put<{ Params: { branch_id: string } }>(
      '/branches/:branch_id/members',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Replace branch members',
          description:
            'Makes membership_ids the exact list of who works at the branch (an empty list removes everyone). Every id must be a live member of the organization. A default-staff field naming someone no longer working here is cleared in the same save (D14). Requires branch:update.',
          tags: ['Branch'],
          params: branchMembersParamsDto,
          body: ReplaceBranchMembersDto,
        },
      },
      controller.replaceBranchMembers,
    );
  };
}
