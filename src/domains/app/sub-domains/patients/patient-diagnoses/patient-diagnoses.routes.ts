import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { PatientDiagnosesService } from './patient-diagnoses.service.js';
import { createPatientDiagnosesController } from './patient-diagnoses.controller.js';
import {
  CreatePatientDiagnosisDto,
  UpdatePatientDiagnosisDto,
  patientDiagnosesIdParamsDto,
  listPatientDiagnosesQueryDto,
} from './patient-diagnoses.dto.js';

/** The by-id routes' path params. */
type DiagnosisParams = { Params: { patient_diagnosis_id: string } };

/**
 * Registers the `patient-diagnoses` routes (prefix `/api/v1/app`) — routes-final 7.E, routes 27–32:
 * the catalogue belongs to no one patient, so its routes are top-level (P11, P28).
 */
export function patientDiagnosesRoutes(service: PatientDiagnosesService): FastifyPluginAsync {
  const controller = createPatientDiagnosesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/patient-diagnoses',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List the diagnosis catalogue',
          description:
            "Returns one page of the organization's diagnosis catalogue (by name by default; `sort=created_at` newest first), with the total count on the first page; `q` matches the name. The picker of a `diagnosis` clinical note (P12). Requires organization:read (every member, P18).",
          tags: ['Patient file'],
          querystring: listPatientDiagnosesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/patient-diagnoses',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a diagnosis',
          description:
            'Adds a diagnosis to the catalogue: `name` (1–120). A name already in it (any case) is a 409 (P18). Requires patient_prescription:create.',
          tags: ['Patient file'],
          body: CreatePatientDiagnosisDto,
        },
      },
      controller.create,
    );
    zodApplication.get<DiagnosisParams>(
      '/patient-diagnoses/:patient_diagnosis_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a diagnosis',
          description:
            'Returns one live diagnosis of the catalogue; a deleted one is a 404. Requires organization:read (every member).',
          tags: ['Patient file'],
          params: patientDiagnosesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<DiagnosisParams>(
      '/patient-diagnoses/:patient_diagnosis_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Rename a diagnosis',
          description:
            "Renames a diagnosis (`name`, 1–120); another entry's name is a 409. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` (D43). Requires patient_prescription:update.",
          tags: ['Patient file'],
          params: patientDiagnosesIdParamsDto,
          body: UpdatePatientDiagnosisDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<DiagnosisParams>(
      '/patient-diagnoses/:patient_diagnosis_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a diagnosis',
          description:
            "Removes a diagnosis from the catalogue with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other — the notes that named it keep their text. Restorable until the organization's purge window ends (D38). Requires patient_prescription:delete.",
          tags: ['Patient file'],
          params: patientDiagnosesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<DiagnosisParams>(
      '/patient-diagnoses/:patient_diagnosis_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a diagnosis',
          description:
            "Undoes a diagnosis's delete. A live entry is a 409 `record_not_deleted`; a name reused meanwhile a 409 `record_restore_conflict`. Requires patient_prescription:delete.",
          tags: ['Patient file'],
          params: patientDiagnosesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
