import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { BranchRoomsService } from './branch-rooms.service.js';
import { createBranchRoomsController } from './branch-rooms.controller.js';
import {
  CreateBranchRoomDto,
  UpdateBranchRoomDto,
  listBranchRoomsQueryDto,
  branchRoomsIdParamsDto,
  branchRoomsParentParamsDto,
} from './branch-rooms.dto.js';

/** Registers the `rooms` routes (prefix `/api/v1/app`). */
export function branchRoomsRoutes(service: BranchRoomsService): FastifyPluginAsync {
  const controller = createBranchRoomsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { branch_id: string } }>(
      '/branches/:branch_id/rooms',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a branch's rooms",
          description:
            'Returns one page of the rooms of a branch (newest first), with the total count. Requires organization:read (every member).',
          tags: ['Branch resource'],
          params: branchRoomsParentParamsDto,
          querystring: listBranchRoomsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { branch_id: string } }>(
      '/branches/:branch_id/rooms',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a room',
          description: 'Adds a room to a branch. Requires branch:create.',
          tags: ['Branch resource'],
          params: branchRoomsParentParamsDto,
          body: CreateBranchRoomDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { branch_id: string; branch_room_id: string } }>(
      '/branches/:branch_id/rooms/:branch_room_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get room',
          description:
            'Returns one room of the branch; one under another branch is a 404. Requires organization:read (every member).',
          tags: ['Branch resource'],
          params: branchRoomsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { branch_id: string; branch_room_id: string } }>(
      '/branches/:branch_id/rooms/:branch_room_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update room',
          description:
            "Changes any of a room's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires branch:update.",
          tags: ['Branch resource'],
          params: branchRoomsIdParamsDto,
          body: UpdateBranchRoomDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { branch_id: string; branch_room_id: string } }>(
      '/branches/:branch_id/rooms/:branch_room_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete room',
          description:
            "Soft-deletes a room with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires branch:delete.",
          tags: ['Branch resource'],
          params: branchRoomsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { branch_id: string; branch_room_id: string } }>(
      '/branches/:branch_id/rooms/:branch_room_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.BRANCH_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore room',
          description: "Undoes a room's delete. A live room is a 409. Requires branch:delete.",
          tags: ['Branch resource'],
          params: branchRoomsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
