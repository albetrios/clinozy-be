import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PatientNotesService } from './patient-notes.service.js';
import { createPatientNotesController } from './patient-notes.controller.js';
import {
  CreatePatientNoteDto,
  UpdatePatientNoteDto,
  listPatientNotesQueryDto,
  patientNotesIdParamsDto,
  patientNotesParentParamsDto,
} from './patient-notes.dto.js';

/** Registers the `patient-notes` routes (prefix `/api/v1/app`). */
export function patientNotesRoutes(service: PatientNotesService): FastifyPluginAsync {
  const controller = createPatientNotesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/notes',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's patient notes",
          description:
            'Returns one page of the patient notes of a patient (newest first), with the total count. Requires patient:read.',
          tags: ['Patient file'],
          params: patientNotesParentParamsDto,
          querystring: listPatientNotesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/notes',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a patient note',
          description: 'Adds a patient note to a patient. Requires patient:update.',
          tags: ['Patient file'],
          params: patientNotesParentParamsDto,
          body: CreatePatientNoteDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { patient_note_id: string } }>(
      '/patient-notes/:patient_note_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get patient note',
          description:
            'Returns one patient note of the active organization. Requires patient:read.',
          tags: ['Patient file'],
          params: patientNotesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { patient_note_id: string } }>(
      '/patient-notes/:patient_note_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update patient note',
          description:
            "Changes any of a patient note's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires patient:update.",
          tags: ['Patient file'],
          params: patientNotesIdParamsDto,
          body: UpdatePatientNoteDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { patient_note_id: string } }>(
      '/patient-notes/:patient_note_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete patient note',
          description:
            "Soft-deletes a patient note with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires patient:update.",
          tags: ['Patient file'],
          params: patientNotesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { patient_note_id: string } }>(
      '/patient-notes/:patient_note_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore patient note',
          description:
            "Undoes a patient note's delete. A live patient note is a 409. Requires patient:update.",
          tags: ['Patient file'],
          params: patientNotesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
