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

/** The by-id routes' path params. */
type ReportParams = { Params: { patient_id: string; patient_report_id: string } };

/**
 * Registers the `patient-reports` routes (prefix `/api/v1/app`) — routes-final 7.G, routes
 * 39–44, nested under the patient.
 */
export function patientReportsRoutes(service: PatientReportsService): FastifyPluginAsync {
  const controller = createPatientReportsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/reports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's reports",
          description:
            "Returns one page of a patient's lab, scan, consent and other reports (newest `report_date` first; `sort=created_at` by entry), with the total count on the first page. Filters: `type`, `q` (the name), the created range. Reports are clinical (P29). Requires patient:clinical_record:read (P14).",
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
        preHandler: [
          requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE),
          requireOrganizationPermission(APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ),
        ],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a report',
          description:
            "Adds a report: `name` (1–120) and `report_date`; optional `type` (`lab` default · `scan` · `consent` · `other`), `file_keys` (up to 10 confirmed uploads of the organization — a 400 on `file_keys` otherwise, P29), `notes` (≤ 1000). A `system` entry joins the contact's activity, shown to clinical-record readers (M10). Requires patient:update and patient:clinical_record:read (P14).",
          tags: ['Patient file'],
          params: patientReportsParentParamsDto,
          body: CreatePatientReportDto,
        },
      },
      controller.create,
    );
    zodApplication.get<ReportParams>(
      '/patients/:patient_id/reports/:patient_report_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a report',
          description:
            "Returns one of a patient's reports — another patient's is a 404. Requires patient:clinical_record:read (P14).",
          tags: ['Patient file'],
          params: patientReportsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<ReportParams>(
      '/patients/:patient_id/reports/:patient_report_id',
      {
        onRequest: [app.authenticate],
        preHandler: [
          requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE),
          requireOrganizationPermission(APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ),
        ],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a report',
          description:
            "Changes any of a report's fields (at least one; null clears an optional one; `file_keys` replaces the files, each a confirmed upload). Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` (D43). Requires patient:update and patient:clinical_record:read (P14).",
          tags: ['Patient file'],
          params: patientReportsIdParamsDto,
          body: UpdatePatientReportDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<ReportParams>(
      '/patients/:patient_id/reports/:patient_report_id',
      {
        onRequest: [app.authenticate],
        preHandler: [
          requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE),
          requireOrganizationPermission(APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ),
        ],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a report',
          description:
            "Deletes a report with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires patient:update and patient:clinical_record:read (P14).",
          tags: ['Patient file'],
          params: patientReportsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<ReportParams>(
      '/patients/:patient_id/reports/:patient_report_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [
          requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE),
          requireOrganizationPermission(APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ),
        ],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a report',
          description:
            "Undoes a report's delete. A live report is a 409 `record_not_deleted`. Requires patient:update and patient:clinical_record:read (P14).",
          tags: ['Patient file'],
          params: patientReportsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
