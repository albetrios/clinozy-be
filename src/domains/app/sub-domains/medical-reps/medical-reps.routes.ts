import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { MedicalRepsService } from './medical-reps.service.js';
import { createMedicalRepsController } from './medical-reps.controller.js';
import {
  CreateMedicalRepDto,
  UpdateMedicalRepDto,
  listMedicalRepsQueryDto,
  medicalRepsIdParamsDto,
} from './medical-reps.dto.js';

/** Registers the `medical-reps` routes (prefix `/api/v1/app`). */
export function medicalRepsRoutes(service: MedicalRepsService): FastifyPluginAsync {
  const controller = createMedicalRepsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/medical-reps',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_REP_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List medical reps',
          description:
            "Returns one page of the active organization's medical reps (newest first by default), with the total count; `q` searches, filters narrow. Requires medical_rep:read.",
          tags: ['Medical store'],
          querystring: listMedicalRepsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/medical-reps',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_REP_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create medical rep',
          description:
            'Adds a medical rep to the active organization. Requires medical_rep:create.',
          tags: ['Medical store'],
          body: CreateMedicalRepDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { medical_rep_id: string } }>(
      '/medical-reps/:medical_rep_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_REP_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get medical rep',
          description:
            'Returns one medical rep of the active organization. Requires medical_rep:read.',
          tags: ['Medical store'],
          params: medicalRepsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { medical_rep_id: string } }>(
      '/medical-reps/:medical_rep_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_REP_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update medical rep',
          description:
            "Changes any of a medical rep's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires medical_rep:update.",
          tags: ['Medical store'],
          params: medicalRepsIdParamsDto,
          body: UpdateMedicalRepDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { medical_rep_id: string } }>(
      '/medical-reps/:medical_rep_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_REP_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete medical rep',
          description:
            "Soft-deletes a medical rep with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires medical_rep:delete.",
          tags: ['Medical store'],
          params: medicalRepsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { medical_rep_id: string } }>(
      '/medical-reps/:medical_rep_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_REP_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore medical rep',
          description:
            "Undoes a medical rep's delete. A live medical rep is a 409. Requires medical_rep:delete.",
          tags: ['Medical store'],
          params: medicalRepsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
