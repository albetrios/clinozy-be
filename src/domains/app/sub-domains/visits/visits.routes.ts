import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { VisitsService } from './visits.service.js';
import { createVisitsController } from './visits.controller.js';
import {
  UpdateVisitDto,
  listVisitsQueryDto,
  stageVisitDto,
  visitsIdParamsDto,
} from './visits.dto.js';

/** Registers the `visits` routes (prefix `/api/v1/app`). */
export function visitsRoutes(service: VisitsService): FastifyPluginAsync {
  const controller = createVisitsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/visits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List visits',
          description:
            "Returns one page of the active organization's visits (newest first by default), with the total count; `q` searches, filters narrow. Requires appointment:read.",
          tags: ['Visit'],
          querystring: listVisitsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get<{ Params: { visit_id: string } }>(
      '/visits/:visit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get visit',
          description: 'Returns one visit of the active organization. Requires appointment:read.',
          tags: ['Visit'],
          params: visitsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { visit_id: string } }>(
      '/visits/:visit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update visit',
          description:
            "Changes any of a visit's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires patient:update.",
          tags: ['Visit'],
          params: visitsIdParamsDto,
          body: UpdateVisitDto,
        },
      },
      controller.update,
    );
    zodApplication.post<{ Params: { visit_id: string } }>(
      '/visits/:visit_id/stage',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Move visit stage',
          description:
            'Moves the visit to its next floor stage \u2014 the server moves a card only on this call (P2). A visit whose status does not allow it is a 409. Requires appointment:update.',
          tags: ['Visit'],
          params: visitsIdParamsDto,
          body: stageVisitDto,
        },
      },
      controller.transition('stage'),
    );
    zodApplication.post<{ Params: { visit_id: string } }>(
      '/visits/:visit_id/pause',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Pause visit',
          description:
            'Pauses the visit. A visit whose status does not allow it is a 409. Requires appointment:update.',
          tags: ['Visit'],
          params: visitsIdParamsDto,
        },
      },
      controller.transition('pause'),
    );
    zodApplication.post<{ Params: { visit_id: string } }>(
      '/visits/:visit_id/resume',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.APPOINTMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Resume visit',
          description:
            'Resumes a paused visit. A visit whose status does not allow it is a 409. Requires appointment:update.',
          tags: ['Visit'],
          params: visitsIdParamsDto,
        },
      },
      controller.transition('resume'),
    );
  };
}
