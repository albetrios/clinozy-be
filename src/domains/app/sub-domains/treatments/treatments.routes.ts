import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { TreatmentsService } from './treatments.service.js';
import { createTreatmentsController } from './treatments.controller.js';
import {
  CreateTreatmentDto,
  UpdateTreatmentDto,
  listTreatmentsQueryDto,
  reverseTreatmentDto,
  treatmentsIdParamsDto,
  treatmentsParentParamsDto,
} from './treatments.dto.js';

/** Registers the `treatments` routes (prefix `/api/v1/app`). */
export function treatmentsRoutes(service: TreatmentsService): FastifyPluginAsync {
  const controller = createTreatmentsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/treatments',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's treatments",
          description:
            'Returns one page of the treatments of a patient (newest first), with the total count. Requires patient:read.',
          tags: ['Treatment'],
          params: treatmentsParentParamsDto,
          querystring: listTreatmentsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/treatments',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TREATMENT_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a treatment',
          description: 'Adds a treatment to a patient. Requires treatment:create.',
          tags: ['Treatment'],
          params: treatmentsParentParamsDto,
          body: CreateTreatmentDto,
        },
      },
      controller.create,
    );
    zodApplication.get(
      '/treatments',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List treatments',
          description:
            "Returns one page of the active organization's treatments (newest first by default), with the total count; `q` searches, filters narrow. Requires patient:read.",
          tags: ['Treatment'],
          querystring: listTreatmentsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get<{ Params: { treatment_id: string } }>(
      '/treatments/:treatment_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get treatment',
          description: 'Returns one treatment of the active organization. Requires patient:read.',
          tags: ['Treatment'],
          params: treatmentsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { treatment_id: string } }>(
      '/treatments/:treatment_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TREATMENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update treatment',
          description:
            "Changes any of a treatment's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires treatment:update.",
          tags: ['Treatment'],
          params: treatmentsIdParamsDto,
          body: UpdateTreatmentDto,
        },
      },
      controller.update,
    );
    zodApplication.post<{ Params: { treatment_id: string } }>(
      '/treatments/:treatment_id/reverse',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TREATMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Reverse treatment',
          description:
            'Reverses a session with a reason \u2014 never deleted (P89, D40); a package session it used is given back. A treatment whose status does not allow it is a 409. Requires treatment:update.',
          tags: ['Treatment'],
          params: treatmentsIdParamsDto,
          body: reverseTreatmentDto,
        },
      },
      controller.transition('reverse'),
    );
  };
}
