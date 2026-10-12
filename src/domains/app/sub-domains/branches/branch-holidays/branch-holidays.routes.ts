import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { BranchHolidaysService } from './branch-holidays.service.js';
import { createBranchHolidaysController } from './branch-holidays.controller.js';
import {
  CreateBranchHolidayDto,
  UpdateBranchHolidayDto,
  branchHolidaysIdParamsDto,
  branchHolidaysParentParamsDto,
  listBranchHolidaysQueryDto,
} from './branch-holidays.dto.js';

/** Registers the `branch-holidays` routes (prefix `/api/v1/app`). */
export function branchHolidaysRoutes(service: BranchHolidaysService): FastifyPluginAsync {
  const controller = createBranchHolidaysController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { branch_id: string } }>(
      '/branches/:branch_id/holidays',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a branch's branch holidays",
          description:
            'Returns one page of the branch holidays of a branch (newest first), with the total count. Requires organization:read (every member).',
          tags: ['Branch resource'],
          params: branchHolidaysParentParamsDto,
          querystring: listBranchHolidaysQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { branch_id: string } }>(
      '/branches/:branch_id/holidays',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a branch holiday',
          description: 'Adds a branch holiday to a branch. Requires branch:create.',
          tags: ['Branch resource'],
          params: branchHolidaysParentParamsDto,
          body: CreateBranchHolidayDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { branch_id: string; branch_holiday_id: string } }>(
      '/branches/:branch_id/holidays/:branch_holiday_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get branch holiday',
          description:
            'Returns one branch holiday of the branch; one under another branch is a 404. Requires organization:read (every member).',
          tags: ['Branch resource'],
          params: branchHolidaysIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { branch_id: string; branch_holiday_id: string } }>(
      '/branches/:branch_id/holidays/:branch_holiday_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update branch holiday',
          description:
            "Changes any of a branch holiday's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires branch:update.",
          tags: ['Branch resource'],
          params: branchHolidaysIdParamsDto,
          body: UpdateBranchHolidayDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { branch_id: string; branch_holiday_id: string } }>(
      '/branches/:branch_id/holidays/:branch_holiday_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete branch holiday',
          description:
            "Soft-deletes a branch holiday with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires branch:delete.",
          tags: ['Branch resource'],
          params: branchHolidaysIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { branch_id: string; branch_holiday_id: string } }>(
      '/branches/:branch_id/holidays/:branch_holiday_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore branch holiday',
          description:
            "Undoes a branch holiday's delete. A live branch holiday is a 409. Requires branch:delete.",
          tags: ['Branch resource'],
          params: branchHolidaysIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
