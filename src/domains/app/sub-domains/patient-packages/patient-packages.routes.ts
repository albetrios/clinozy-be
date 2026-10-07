import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PatientPackagesService } from './patient-packages.service.js';
import { createPatientPackagesController } from './patient-packages.controller.js';
import {
  CreatePatientPackageDto,
  UpdatePatientPackageDto,
  listPatientPackagesQueryDto,
  patientPackagesIdParamsDto,
  patientPackagesParentParamsDto,
} from './patient-packages.dto.js';

/** Registers the `patient-packages` routes (prefix `/api/v1/app`). */
export function patientPackagesRoutes(service: PatientPackagesService): FastifyPluginAsync {
  const controller = createPatientPackagesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/packages',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's patient packages",
          description:
            'Returns one page of the patient packages of a patient (newest first), with the total count. Requires patient:read.',
          tags: ['Invoice'],
          params: patientPackagesParentParamsDto,
          querystring: listPatientPackagesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/packages',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a patient package',
          description: 'Adds a patient package to a patient. Requires payment:create.',
          tags: ['Invoice'],
          params: patientPackagesParentParamsDto,
          body: CreatePatientPackageDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { patient_package_id: string } }>(
      '/patient-packages/:patient_package_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get patient package',
          description:
            'Returns one patient package of the active organization. Requires patient:read.',
          tags: ['Invoice'],
          params: patientPackagesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { patient_package_id: string } }>(
      '/patient-packages/:patient_package_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update patient package',
          description:
            "Changes any of a patient package's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires patient:update.",
          tags: ['Invoice'],
          params: patientPackagesIdParamsDto,
          body: UpdatePatientPackageDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { patient_package_id: string } }>(
      '/patient-packages/:patient_package_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete patient package',
          description:
            "Soft-deletes a patient package with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires payment:delete.",
          tags: ['Invoice'],
          params: patientPackagesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { patient_package_id: string } }>(
      '/patient-packages/:patient_package_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore patient package',
          description:
            "Undoes a patient package's delete. A live patient package is a 409. Requires payment:delete.",
          tags: ['Invoice'],
          params: patientPackagesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
