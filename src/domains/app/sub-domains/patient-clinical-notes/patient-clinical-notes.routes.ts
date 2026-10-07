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

/** Registers the `patient-clinical-notes` routes (prefix `/api/v1/app`). */
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CLINICAL_RECORD_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's clinical notes",
          description:
            'Returns one page of the clinical notes of a patient (newest first), with the total count. Requires clinical_record:read.',
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a clinical note',
          description: 'Adds a clinical note to a patient. Requires patient:update.',
          tags: ['Patient file'],
          params: patientClinicalNotesParentParamsDto,
          body: CreatePatientClinicalNoteDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { patient_clinical_note_id: string } }>(
      '/patient-clinical-notes/:patient_clinical_note_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CLINICAL_RECORD_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get clinical note',
          description:
            'Returns one clinical note of the active organization. Requires clinical_record:read.',
          tags: ['Patient file'],
          params: patientClinicalNotesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.delete<{ Params: { patient_clinical_note_id: string } }>(
      '/patient-clinical-notes/:patient_clinical_note_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete clinical note',
          description:
            "Soft-deletes a clinical note with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires patient:update.",
          tags: ['Patient file'],
          params: patientClinicalNotesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { patient_clinical_note_id: string } }>(
      '/patient-clinical-notes/:patient_clinical_note_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore clinical note',
          description:
            "Undoes a clinical note's delete. A live clinical note is a 409. Requires patient:update.",
          tags: ['Patient file'],
          params: patientClinicalNotesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
