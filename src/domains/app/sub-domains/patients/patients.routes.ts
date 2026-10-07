import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PatientsService } from './patients.service.js';
import { createPatientsController } from './patients.controller.js';
import {
  CreatePatientDto,
  UpdatePatientDto,
  listPatientsQueryDto,
  patientsIdParamsDto,
} from './patients.dto.js';

/** Registers the `patients` routes (prefix `/api/v1/app`). */
export function patientsRoutes(service: PatientsService): FastifyPluginAsync {
  const controller = createPatientsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/patients',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List patients',
          description:
            "Returns one page of the active organization's patients (newest first by default), with the total count; `q` searches, filters narrow. Requires patient:read.",
          tags: ['Patient'],
          querystring: listPatientsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get(
      '/patients/exports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LIST_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export patients',
          description:
            'Returns the patients the same filters and sort as the list would (every page, up to 5,000 rows) as a CSV file inside the JSON envelope (`file_name`, `content_type`, `row_count`, `is_truncated`, `content`). Requires `list:export` ("Export lists") and patient:read.',
          tags: ['Patient'],
          querystring: listPatientsQueryDto,
        },
      },
      controller.export,
    );
    zodApplication.post(
      '/patients',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create patient',
          description: 'Adds a patient to the active organization. Requires patient:create.',
          tags: ['Patient'],
          body: CreatePatientDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get patient',
          description: 'Returns one patient of the active organization. Requires patient:read.',
          tags: ['Patient'],
          params: patientsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { patient_id: string } }>(
      '/patients/:patient_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update patient',
          description:
            "Changes any of a patient's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires patient:update.",
          tags: ['Patient'],
          params: patientsIdParamsDto,
          body: UpdatePatientDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { patient_id: string } }>(
      '/patients/:patient_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete patient',
          description:
            "Soft-deletes a patient with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires patient:delete.",
          tags: ['Patient'],
          params: patientsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore patient',
          description:
            "Undoes a patient's delete. A live patient is a 409. Requires patient:delete.",
          tags: ['Patient'],
          params: patientsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
