import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { MedicalRepVisitsService } from './medical-rep-visits.service.js';
import { createMedicalRepVisitsController } from './medical-rep-visits.controller.js';
import {
  CreateMedicalRepVisitDto,
  UpdateMedicalRepVisitDto,
  listMedicalRepVisitsQueryDto,
  medicalRepVisitsIdParamsDto,
  medicalRepVisitsParentParamsDto,
} from './medical-rep-visits.dto.js';

/** Registers the `medical-rep-visits` routes (prefix `/api/v1/app`). */
export function medicalRepVisitsRoutes(service: MedicalRepVisitsService): FastifyPluginAsync {
  const controller = createMedicalRepVisitsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { medical_rep_id: string } }>(
      '/medical-reps/:medical_rep_id/visits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_REP_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a medical rep's medical rep visits",
          description:
            'Returns one page of the medical rep visits of a medical rep (newest first), with the total count. Requires medical_rep:read.',
          tags: ['Medical store'],
          params: medicalRepVisitsParentParamsDto,
          querystring: listMedicalRepVisitsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { medical_rep_id: string } }>(
      '/medical-reps/:medical_rep_id/visits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_REP_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a medical rep visit',
          description: 'Adds a medical rep visit to a medical rep. Requires medical_rep:update.',
          tags: ['Medical store'],
          params: medicalRepVisitsParentParamsDto,
          body: CreateMedicalRepVisitDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { medical_rep_visit_id: string } }>(
      '/medical-rep-visits/:medical_rep_visit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_REP_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get medical rep visit',
          description:
            'Returns one medical rep visit of the active organization. Requires medical_rep:read.',
          tags: ['Medical store'],
          params: medicalRepVisitsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { medical_rep_visit_id: string } }>(
      '/medical-rep-visits/:medical_rep_visit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_REP_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update medical rep visit',
          description:
            "Changes any of a medical rep visit's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires medical_rep:update.",
          tags: ['Medical store'],
          params: medicalRepVisitsIdParamsDto,
          body: UpdateMedicalRepVisitDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { medical_rep_visit_id: string } }>(
      '/medical-rep-visits/:medical_rep_visit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_REP_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete medical rep visit',
          description:
            "Soft-deletes a medical rep visit with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires medical_rep:update.",
          tags: ['Medical store'],
          params: medicalRepVisitsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { medical_rep_visit_id: string } }>(
      '/medical-rep-visits/:medical_rep_visit_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_REP_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore medical rep visit',
          description:
            "Undoes a medical rep visit's delete. A live medical rep visit is a 409. Requires medical_rep:update.",
          tags: ['Medical store'],
          params: medicalRepVisitsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
