import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { BranchUserAccessesService } from './branch-user-accesses.service.js';
import { createBranchUserAccessesController } from './branch-user-accesses.controller.js';
import {
  branchUserAccessesParamsDto,
  ReplaceBranchUserAccessesDto,
} from './branch-user-accesses.dto.js';

/** Registers the `/app/branches/{branch_id}/user-accesses` routes (prefix `/api/v1/app`). */
export function branchUserAccessesRoutes(service: BranchUserAccessesService): FastifyPluginAsync {
  const controller = createBranchUserAccessesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { branch_id: string } }>(
      '/branches/:branch_id/user-accesses',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List branch user accesses',
          description:
            'Returns the memberships that work in a branch, oldest grant first. Requires branch:update.',
          tags: ['Branch'],
          params: branchUserAccessesParamsDto,
        },
      },
      controller.listBranchUserAccesses,
    );
    zodApplication.put<{ Params: { branch_id: string } }>(
      '/branches/:branch_id/user-accesses',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Replace branch user accesses',
          description:
            'Makes membership_ids the exact list of who works in the branch (an empty list removes everyone). Every id must be a live member of the active organization. Requires branch:update.',
          tags: ['Branch'],
          params: branchUserAccessesParamsDto,
          body: ReplaceBranchUserAccessesDto,
        },
      },
      controller.replaceBranchUserAccesses,
    );
  };
}
