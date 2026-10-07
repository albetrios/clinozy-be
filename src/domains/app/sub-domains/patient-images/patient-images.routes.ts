import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PatientImagesService } from './patient-images.service.js';
import { createPatientImagesController } from './patient-images.controller.js';
import {
  CreatePatientImageDto,
  UpdatePatientImageDto,
  listPatientImagesQueryDto,
  patientImagesIdParamsDto,
  patientImagesParentParamsDto,
} from './patient-images.dto.js';

/** Registers the `patient-images` routes (prefix `/api/v1/app`). */
export function patientImagesRoutes(service: PatientImagesService): FastifyPluginAsync {
  const controller = createPatientImagesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/images',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CLINICAL_RECORD_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's patient images",
          description:
            'Returns one page of the patient images of a patient (newest first), with the total count. Requires clinical_record:read.',
          tags: ['Patient file'],
          params: patientImagesParentParamsDto,
          querystring: listPatientImagesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/images',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a patient image',
          description: 'Adds a patient image to a patient. Requires patient:update.',
          tags: ['Patient file'],
          params: patientImagesParentParamsDto,
          body: CreatePatientImageDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { patient_image_id: string } }>(
      '/patient-images/:patient_image_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CLINICAL_RECORD_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get patient image',
          description:
            'Returns one patient image of the active organization. Requires clinical_record:read.',
          tags: ['Patient file'],
          params: patientImagesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { patient_image_id: string } }>(
      '/patient-images/:patient_image_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update patient image',
          description:
            "Changes any of a patient image's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires patient:update.",
          tags: ['Patient file'],
          params: patientImagesIdParamsDto,
          body: UpdatePatientImageDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { patient_image_id: string } }>(
      '/patient-images/:patient_image_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete patient image',
          description:
            "Soft-deletes a patient image with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires patient:update.",
          tags: ['Patient file'],
          params: patientImagesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { patient_image_id: string } }>(
      '/patient-images/:patient_image_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore patient image',
          description:
            "Undoes a patient image's delete. A live patient image is a 409. Requires patient:update.",
          tags: ['Patient file'],
          params: patientImagesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
