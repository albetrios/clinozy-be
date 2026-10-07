import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { DiagnosesService } from './diagnoses.service.js';
import { createDiagnosesController } from './diagnoses.controller.js';
import {
  CreateDiagnosisDto,
  UpdateDiagnosisDto,
  diagnosesIdParamsDto,
  listDiagnosesQueryDto,
} from './diagnoses.dto.js';

/** Registers the `diagnoses` routes (prefix `/api/v1/app`). */
export function diagnosesRoutes(service: DiagnosesService): FastifyPluginAsync {
  const controller = createDiagnosesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/diagnoses',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List diagnoses',
          description:
            "Returns one page of the active organization's diagnoses (newest first by default), with the total count; `q` searches, filters narrow. Requires patient:read.",
          tags: ['Patient file'],
          querystring: listDiagnosesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/diagnoses',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create diagnosis',
          description: 'Adds a diagnosis to the active organization. Requires prescription:create.',
          tags: ['Patient file'],
          body: CreateDiagnosisDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { diagnosis_id: string } }>(
      '/diagnoses/:diagnosis_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get diagnosis',
          description: 'Returns one diagnosis of the active organization. Requires patient:read.',
          tags: ['Patient file'],
          params: diagnosesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { diagnosis_id: string } }>(
      '/diagnoses/:diagnosis_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update diagnosis',
          description:
            "Changes any of a diagnosis's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires prescription:update.",
          tags: ['Patient file'],
          params: diagnosesIdParamsDto,
          body: UpdateDiagnosisDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { diagnosis_id: string } }>(
      '/diagnoses/:diagnosis_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete diagnosis',
          description:
            "Soft-deletes a diagnosis with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires prescription:delete.",
          tags: ['Patient file'],
          params: diagnosesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { diagnosis_id: string } }>(
      '/diagnoses/:diagnosis_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore diagnosis',
          description:
            "Undoes a diagnosis's delete. A live diagnosis is a 409. Requires prescription:delete.",
          tags: ['Patient file'],
          params: diagnosesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
