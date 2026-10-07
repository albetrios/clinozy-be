import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PatientReportsService } from './patient-reports.service.js';
import { createPatientReportsController } from './patient-reports.controller.js';
import {
  CreatePatientReportDto,
  UpdatePatientReportDto,
  listPatientReportsQueryDto,
  patientReportsIdParamsDto,
  patientReportsParentParamsDto,
} from './patient-reports.dto.js';

/** Registers the `patient-reports` routes (prefix `/api/v1/app`). */
export function patientReportsRoutes(service: PatientReportsService): FastifyPluginAsync {
  const controller = createPatientReportsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/reports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's patient reports",
          description:
            'Returns one page of the patient reports of a patient (newest first), with the total count. Requires patient:read.',
          tags: ['Patient file'],
          params: patientReportsParentParamsDto,
          querystring: listPatientReportsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/reports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a patient report',
          description: 'Adds a patient report to a patient. Requires patient:update.',
          tags: ['Patient file'],
          params: patientReportsParentParamsDto,
          body: CreatePatientReportDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { patient_report_id: string } }>(
      '/patient-reports/:patient_report_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get patient report',
          description:
            'Returns one patient report of the active organization. Requires patient:read.',
          tags: ['Patient file'],
          params: patientReportsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { patient_report_id: string } }>(
      '/patient-reports/:patient_report_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update patient report',
          description:
            "Changes any of a patient report's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires patient:update.",
          tags: ['Patient file'],
          params: patientReportsIdParamsDto,
          body: UpdatePatientReportDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { patient_report_id: string } }>(
      '/patient-reports/:patient_report_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete patient report',
          description:
            "Soft-deletes a patient report with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires patient:update.",
          tags: ['Patient file'],
          params: patientReportsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { patient_report_id: string } }>(
      '/patient-reports/:patient_report_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore patient report',
          description:
            "Undoes a patient report's delete. A live patient report is a 409. Requires patient:update.",
          tags: ['Patient file'],
          params: patientReportsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
