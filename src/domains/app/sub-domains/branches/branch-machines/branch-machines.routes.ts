import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { BranchMachinesService } from './branch-machines.service.js';
import { createBranchMachinesController } from './branch-machines.controller.js';
import {
  CreateBranchMachineDto,
  UpdateBranchMachineDto,
  listBranchMachinesQueryDto,
  branchMachinesIdParamsDto,
  branchMachinesParentParamsDto,
} from './branch-machines.dto.js';

/** Registers the `machines` routes (prefix `/api/v1/app`). */
export function branchMachinesRoutes(service: BranchMachinesService): FastifyPluginAsync {
  const controller = createBranchMachinesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { branch_id: string } }>(
      '/branches/:branch_id/machines',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a branch's machines",
          description:
            'Returns one page of the machines of a branch (newest first), with the total count. Requires organization:read (every member).',
          tags: ['Branch resource'],
          params: branchMachinesParentParamsDto,
          querystring: listBranchMachinesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { branch_id: string } }>(
      '/branches/:branch_id/machines',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a machine',
          description: 'Adds a machine to a branch. Requires branch:create.',
          tags: ['Branch resource'],
          params: branchMachinesParentParamsDto,
          body: CreateBranchMachineDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { branch_id: string; branch_machine_id: string } }>(
      '/branches/:branch_id/machines/:branch_machine_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get machine',
          description:
            'Returns one machine of the branch; one under another branch is a 404. Requires organization:read (every member).',
          tags: ['Branch resource'],
          params: branchMachinesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { branch_id: string; branch_machine_id: string } }>(
      '/branches/:branch_id/machines/:branch_machine_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update machine',
          description:
            "Changes any of a machine's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires branch:update.",
          tags: ['Branch resource'],
          params: branchMachinesIdParamsDto,
          body: UpdateBranchMachineDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { branch_id: string; branch_machine_id: string } }>(
      '/branches/:branch_id/machines/:branch_machine_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete machine',
          description:
            "Soft-deletes a machine with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires branch:delete.",
          tags: ['Branch resource'],
          params: branchMachinesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { branch_id: string; branch_machine_id: string } }>(
      '/branches/:branch_id/machines/:branch_machine_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore machine',
          description:
            "Undoes a machine's delete. A live machine is a 409. Requires branch:delete.",
          tags: ['Branch resource'],
          params: branchMachinesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
