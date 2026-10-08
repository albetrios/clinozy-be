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

/** Registers the `patients` routes (prefix `/api/v1/app`) — routes-final 7.A, routes 1–7. */
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
            "Returns one page of the active organization's patient files — each carries `contact_id` only, no embedded contact (P3; read the names with `GET /contacts?ids=…`). `q` searches the patient number (`PT-0412`, `#412`) and, through the contact, names, numbers and the contact number (`C-12345`) — text needs 3+ characters, a number 4+ digits (a 400 otherwise, P9). Filters: `status`, `conversion`, `types` (comma-separated — any of them), `home_branch_id`, `doctor_membership_id`, `contact_id`, the follow-up and created ranges. Sort `created_at` (default, newest first), `patient_number` or `follow_up_at` (a file without one last). Not branch-scoped (P6). Requires patient:read.",
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export patients',
          description:
            "Returns the patient files the same filters and sort as the list would (every page, up to 5,000 rows; `limit` and `after` ignored) as a CSV file inside the JSON envelope (`file_name` `patients-YYYY-MM-DD.csv`, `content_type`, `row_count`, `is_truncated`, `content` — the file fields as columns plus the contact's `contact_name` and `contact_primary_phone`, lists joined with `|`). Requires patient:export (P5) and patient:read.",
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
          description:
            'Adds a patient file — the clinical side of a contact: `contact_id`, or `contact` — a new contact (the contact create body) written in the same transaction (P1; needs contact:create too — a 403 otherwise). Exactly one of them (a 400 on `contact_id`). A contact has at most one live file: a second is a 409 `contact_is_patient` naming it; an inline number on another household is a 409 `contact_phone_exists`. `home_branch_id` is required; the usual doctor (`doctor_membership_id`) handles the contact. A check-in opens a file on its own (no patient:create needed). Requires patient:create.',
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
          description:
            'Returns one patient file of the active organization (`contact_id` only — the person lives on the contact, P3). Requires patient:read.',
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
            "Changes any of a patient file's fields but its contact (at least one; null clears an optional one) — name, numbers, gender, birth date and referral are the contact's (4). `conversion` stays editable (P4). A new usual doctor handles the contact. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` (D43). Requires patient:update.",
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
            'Removes a patient file with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. It is hidden, never purged — nothing clinical is deleted and it can always be restored (P7). Requires patient:delete.',
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
            "Undoes a patient file's removal. A live file is a 409 `record_not_deleted`; a contact that has another live file meanwhile a 409 `contact_is_patient` (P1); a removed contact a 409 `record_restore_conflict`. Requires patient:delete.",
          tags: ['Patient'],
          params: patientsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
