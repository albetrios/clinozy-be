import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { BranchesService } from './branches.service.js';
import { createBranchesController } from './branches.controller.js';
import {
  branchIdParamsDto,
  CreateBranchDto,
  listBranchesQueryDto,
  UpdateBranchDto,
} from './branches.dto.js';

/** Registers the `/app/branches` routes (prefix `/api/v1/app`). */
export function branchesRoutes(service: BranchesService): FastifyPluginAsync {
  const controller = createBranchesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/branches/my',
      {
        onRequest: [app.authenticate],
        // Every role holds organization:read — "any member", with the organization's MFA policy.
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List my branches',
          description:
            'Returns the active branches of the active organization the caller works in — their branch accesses; a caller holding branch:read gets every active branch. Each with its name, tone, main flag, opening hours and working days, and the address (`address_line_one`, `address_line_two`, `area`, `city`, `state`, `postal_code`), `phone` and `gst_number` a printed GST invoice carries (D81). Main branch first, then by name; not paginated. Used by every member (branch picker, booking rules, the invoice print).',
          tags: ['Branch'],
        },
      },
      controller.listMyBranches,
    );
    zodApplication.get(
      '/branches',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List branches',
          description:
            'Returns every branch of the active organization with its full details — inactive ones too with include_inactive=true. Main branch first, then by name; not paginated. Requires branch:read.',
          tags: ['Branch'],
          querystring: listBranchesQueryDto,
        },
      },
      controller.listBranches,
    );
    zodApplication.get<{ Params: { branch_id: string } }>(
      '/branches/:branch_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get branch',
          description: 'Returns one branch of the active organization. Requires branch:read.',
          tags: ['Branch'],
          params: branchIdParamsDto,
        },
      },
      controller.getBranch,
    );
    zodApplication.post(
      '/branches',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create branch',
          description:
            "Adds a branch with who works there from day one — `membership_ids` (team member ids), else its creator (D13). Each default-staff member must be one of them, else a 400 (D10). A clinic's first branch becomes its main branch even when `is_main` is not sent. A name already used here, or `is_main: true` while another branch is main, is a 409. Requires branch:create.",
          tags: ['Branch'],
          body: CreateBranchDto,
        },
      },
      controller.createBranch,
    );
    zodApplication.patch<{ Params: { branch_id: string } }>(
      '/branches/:branch_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update branch',
          description:
            'Changes any of a branch’s fields (retire it with `is_active=false` — a branch is never deleted); null clears an optional one. Each default-staff member must be one of the branch’s members, else a 400 (D10). Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). A name already used here, or a second main branch, is a 409. Requires branch:update.',
          tags: ['Branch'],
          params: branchIdParamsDto,
          body: UpdateBranchDto,
        },
      },
      controller.updateBranch,
    );
  };
}
