import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { RoomsService } from './rooms.service.js';
import { createRoomsController } from './rooms.controller.js';
import {
  CreateRoomDto,
  UpdateRoomDto,
  listRoomsQueryDto,
  roomsIdParamsDto,
  roomsParentParamsDto,
} from './rooms.dto.js';

/** Registers the `rooms` routes (prefix `/api/v1/app`). */
export function roomsRoutes(service: RoomsService): FastifyPluginAsync {
  const controller = createRoomsController(service);

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
          params: roomsParentParamsDto,
          querystring: listRoomsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { branch_id: string } }>(
      '/branches/:branch_id/rooms',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.ROOM_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a room',
          description: 'Adds a room to a branch. Requires room:create.',
          tags: ['Branch resource'],
          params: roomsParentParamsDto,
          body: CreateRoomDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { room_id: string } }>(
      '/rooms/:room_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get room',
          description:
            'Returns one room of the active organization. Requires organization:read (every member).',
          tags: ['Branch resource'],
          params: roomsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { room_id: string } }>(
      '/rooms/:room_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.ROOM_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update room',
          description:
            "Changes any of a room's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires room:update.",
          tags: ['Branch resource'],
          params: roomsIdParamsDto,
          body: UpdateRoomDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { room_id: string } }>(
      '/rooms/:room_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.ROOM_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete room',
          description:
            "Soft-deletes a room with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires room:delete.",
          tags: ['Branch resource'],
          params: roomsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { room_id: string } }>(
      '/rooms/:room_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.ROOM_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore room',
          description: "Undoes a room's delete. A live room is a 409. Requires room:delete.",
          tags: ['Branch resource'],
          params: roomsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
