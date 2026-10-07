import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { DayClosesService } from './day-closes.service.js';
import { createDayClosesController } from './day-closes.controller.js';
import {
  CreateDayCloseDto,
  closeDayCloseDto,
  dayClosesIdParamsDto,
  listDayClosesQueryDto,
} from './day-closes.dto.js';

/** Registers the `day-closes` routes (prefix `/api/v1/app`). */
export function dayClosesRoutes(service: DayClosesService): FastifyPluginAsync {
  const controller = createDayClosesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/day-closes',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.DAY_CLOSE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List day closes',
          description:
            "Returns one page of the active organization's day closes (newest first by default), with the total count; `q` searches, filters narrow. Requires day_close:read.",
          tags: ['Payment'],
          querystring: listDayClosesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/day-closes',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.DAY_CLOSE_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create day close',
          description: 'Adds a day close to the active organization. Requires day_close:create.',
          tags: ['Payment'],
          body: CreateDayCloseDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { day_close_id: string } }>(
      '/day-closes/:day_close_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.DAY_CLOSE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get day close',
          description: 'Returns one day close of the active organization. Requires day_close:read.',
          tags: ['Payment'],
          params: dayClosesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.post<{ Params: { day_close_id: string } }>(
      '/day-closes/:day_close_id/close',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.DAY_CLOSE_CLOSE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Close the day',
          description:
            'Closes the day with the counted cash \u2014 a reason when the count differs (D24). A day close whose status does not allow it is a 409. Requires day_close:close.',
          tags: ['Payment'],
          params: dayClosesIdParamsDto,
          body: closeDayCloseDto,
        },
      },
      controller.transition('close'),
    );
    zodApplication.post<{ Params: { day_close_id: string } }>(
      '/day-closes/:day_close_id/reopen',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.DAY_CLOSE_CLOSE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Reopen the day',
          description:
            'Reopens a closed day. A day close whose status does not allow it is a 409. Requires day_close:close.',
          tags: ['Payment'],
          params: dayClosesIdParamsDto,
        },
      },
      controller.transition('reopen'),
    );
  };
}
