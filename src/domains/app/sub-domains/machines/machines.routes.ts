import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { MachinesService } from './machines.service.js';
import { createMachinesController } from './machines.controller.js';
import {
  CreateMachineDto,
  UpdateMachineDto,
  listMachinesQueryDto,
  machinesIdParamsDto,
  machinesParentParamsDto,
} from './machines.dto.js';

/** Registers the `machines` routes (prefix `/api/v1/app`). */
export function machinesRoutes(service: MachinesService): FastifyPluginAsync {
  const controller = createMachinesController(service);

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
          params: machinesParentParamsDto,
          querystring: listMachinesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { branch_id: string } }>(
      '/branches/:branch_id/machines',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MACHINE_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a machine',
          description: 'Adds a machine to a branch. Requires machine:create.',
          tags: ['Branch resource'],
          params: machinesParentParamsDto,
          body: CreateMachineDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { machine_id: string } }>(
      '/machines/:machine_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get machine',
          description:
            'Returns one machine of the active organization. Requires organization:read (every member).',
          tags: ['Branch resource'],
          params: machinesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { machine_id: string } }>(
      '/machines/:machine_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MACHINE_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update machine',
          description:
            "Changes any of a machine's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires machine:update.",
          tags: ['Branch resource'],
          params: machinesIdParamsDto,
          body: UpdateMachineDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { machine_id: string } }>(
      '/machines/:machine_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MACHINE_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete machine',
          description:
            "Soft-deletes a machine with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires machine:delete.",
          tags: ['Branch resource'],
          params: machinesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { machine_id: string } }>(
      '/machines/:machine_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MACHINE_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore machine',
          description:
            "Undoes a machine's delete. A live machine is a 409. Requires machine:delete.",
          tags: ['Branch resource'],
          params: machinesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
