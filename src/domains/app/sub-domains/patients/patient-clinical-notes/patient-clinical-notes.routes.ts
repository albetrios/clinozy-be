import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PatientClinicalNotesService } from './patient-clinical-notes.service.js';
import { createPatientClinicalNotesController } from './patient-clinical-notes.controller.js';
import {
  CreatePatientClinicalNoteDto,
  listPatientClinicalNotesQueryDto,
  patientClinicalNotesIdParamsDto,
  patientClinicalNotesParentParamsDto,
} from './patient-clinical-notes.dto.js';

/** The by-id routes' path params. */
type ClinicalNoteParams = { Params: { patient_id: string; patient_clinical_note_id: string } };

/** Reading the clinical record (P14). */
const CLINICAL_READ = [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ)];
/** Writing it: `patient:update` and the clinical code (P14). */
const CLINICAL_WRITE = [
  requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE),
  requireOrganizationPermission(APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ),
];

/**
 * Registers the `patient-clinical-notes` routes (prefix `/api/v1/app`) — routes-final 7.B, routes
 * 8–12, nested under the patient.
 */
export function patientClinicalNotesRoutes(
  service: PatientClinicalNotesService,
): FastifyPluginAsync {
  const controller = createPatientClinicalNotesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/clinical-notes',
      {
        onRequest: [app.authenticate],
        preHandler: CLINICAL_READ,
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's clinical notes",
          description:
            "Returns one page of a patient's clinical notes (newest first), with the total count. Filters: `kind` (comma-separated — any of them), `appointment_id` (one visit's notes), `q` (the text), the created range. A removed or unknown patient is a 404. Requires patient:clinical_record:read (P14).",
          tags: ['Patient file'],
          params: patientClinicalNotesParentParamsDto,
          querystring: listPatientClinicalNotesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/clinical-notes',
      {
        onRequest: [app.authenticate],
        preHandler: CLINICAL_WRITE,
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a clinical note',
          description:
            "Adds a clinical note to a patient: `kind` (complaint, finding, diagnosis, treatment_suggestion, future_suggestion, safety_check) and `text` (1–500); optional `appointment_id` — a visit of the patient's (a 400 otherwise) — and, on a `diagnosis` note only, `patient_diagnosis_id` from the catalogue (a 400 otherwise, P12). A `system` entry joins the contact's activity, shown to clinical-record readers (M10). Notes are never edited — delete a wrong one and write it again. Requires patient:update and patient:clinical_record:read (P14).",
          tags: ['Patient file'],
          params: patientClinicalNotesParentParamsDto,
          body: CreatePatientClinicalNoteDto,
        },
      },
      controller.create,
    );
    zodApplication.get<ClinicalNoteParams>(
      '/patients/:patient_id/clinical-notes/:patient_clinical_note_id',
      {
        onRequest: [app.authenticate],
        preHandler: CLINICAL_READ,
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a clinical note',
          description:
            "Returns one of a patient's clinical notes — another patient's is a 404. Requires patient:clinical_record:read (P14).",
          tags: ['Patient file'],
          params: patientClinicalNotesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.delete<ClinicalNoteParams>(
      '/patients/:patient_id/clinical-notes/:patient_clinical_note_id',
      {
        onRequest: [app.authenticate],
        preHandler: CLINICAL_WRITE,
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a clinical note',
          description:
            "Deletes a wrong clinical note with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires patient:update and patient:clinical_record:read (P14).",
          tags: ['Patient file'],
          params: patientClinicalNotesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<ClinicalNoteParams>(
      '/patients/:patient_id/clinical-notes/:patient_clinical_note_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: CLINICAL_WRITE,
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a clinical note',
          description:
            "Undoes a clinical note's delete. A live note is a 409 `record_not_deleted`. Requires patient:update and patient:clinical_record:read (P14).",
          tags: ['Patient file'],
          params: patientClinicalNotesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
