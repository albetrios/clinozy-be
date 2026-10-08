import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { LogPatientFeedbackActionDto } from '@/domains/app/sub-domains/patients/patient-feedback-actions/patient-feedback-actions.dto.js';
import type { PatientCheckInsService } from './patient-check-ins.service.js';
import { createPatientCheckInsController } from './patient-check-ins.controller.js';
import {
  CreatePatientCheckInDto,
  UpdatePatientCheckInDto,
  listPatientCheckInsQueryDto,
  patientCheckInsIdParamsDto,
  patientCheckInsParentParamsDto,
} from './patient-check-ins.dto.js';

/** The by-id routes' path params. */
type CheckInParams = { Params: { patient_id: string; patient_check_in_id: string } };

/**
 * Registers the `patient-check-ins` routes (prefix `/api/v1/app`) — routes-final 7.I, routes
 * 51–56, and 7.K route 63 (an action logged under a check-in), nested under the patient.
 */
export function patientCheckInsRoutes(service: PatientCheckInsService): FastifyPluginAsync {
  const controller = createPatientCheckInsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/check-ins',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's check-ins",
          description:
            "Returns one page of a patient's check-ins (newest `check_in_date` first; `sort=created_at` by logging time), each with `score_change` against the previous check-in (the ▲▼ trend), `next_offering_ids` (its plan rows), `actions` (what was done about it, newest first) and `needs_action` — feel `worse` or a score ≤ 4 with no action logged (TR9). Filters: `feel` (several, comma-separated), `needs_action`, `patient_treatment_id`, `appointment_id`, `check_in_date_from` / `check_in_date_to` (whole days, inclusive), the created range. Requires patient:read.",
          tags: ['Patient file'],
          params: patientCheckInsParentParamsDto,
          querystring: listPatientCheckInsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/check-ins',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Log a check-in',
          description:
            'Logs how a patient is doing: `feel*` (`much_better` · `better` · `same` · `worse`), `score*` (1–10); optional `check_in_date` (default the organization\'s today, never in the future), `context` (≤ 80 — "After <treatment>" or "Visit · <date>" when not sent, TR9), `appointment_id` and `patient_treatment_id` (the patient\'s — a 400 otherwise), `followed` (`fully` · `mostly` · `partly` · `not_at_all`), `followed_note` (≤ 280), `current_state`, `next_plan` (≤ 500), and `next_offering_ids` — up to 10 active offerings (a 400 otherwise), each planned for the patient once (one already in the plan is skipped, TR10). A `system` entry joins the contact\'s activity; one that needs action (feel `worse` or a score ≤ 4) also creates a doctor call-back task. Requires patient:update.',
          tags: ['Patient file'],
          params: patientCheckInsParentParamsDto,
          body: CreatePatientCheckInDto,
        },
      },
      controller.create,
    );
    zodApplication.get<CheckInParams>(
      '/patients/:patient_id/check-ins/:patient_check_in_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a check-in',
          description:
            "Returns one of a patient's check-ins with its trend, plan rows and actions — another patient's, or a deleted one, is a 404. Requires patient:read.",
          tags: ['Patient file'],
          params: patientCheckInsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<CheckInParams>(
      '/patients/:patient_id/check-ins/:patient_check_in_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a check-in',
          description:
            'Changes a check-in — any field of the log but `next_offering_ids` (the plan changes in the plan; at least one; null clears an optional one), with the same checks. An edit that turns it into one needing action adds a call-back task. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` (D43). Requires patient:update.',
          tags: ['Patient file'],
          params: patientCheckInsIdParamsDto,
          body: UpdatePatientCheckInDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<CheckInParams>(
      '/patients/:patient_id/check-ins/:patient_check_in_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a check-in',
          description:
            "Deletes a check-in with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires patient:update.",
          tags: ['Patient file'],
          params: patientCheckInsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<CheckInParams>(
      '/patients/:patient_id/check-ins/:patient_check_in_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a check-in',
          description:
            "Undoes a check-in's delete. A live check-in is a 409 `record_not_deleted`. Requires patient:update.",
          tags: ['Patient file'],
          params: patientCheckInsIdParamsDto,
        },
      },
      controller.restore,
    );
    zodApplication.post<CheckInParams>(
      '/patients/:patient_id/check-ins/:patient_check_in_id/actions',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Log a check-in action',
          description:
            'Logs what was done about a check-in: `action*` (`doctor_called` · `asked_revisit` · `free_review_booked` · `plan_changed` · `replied_google` · `replied_instagram` · `replied_whatsapp` · `refund_credit` · `other`) and `note` (1–280, required for other — a 400 otherwise); the caller is the author. Append-only — a wrong one is followed by a right one (TR12); the first turns `needs_action` off. Answers the check-in with its `actions`, the new one first. A check-in of another patient, or a deleted one, is a 404. Requires patient:update.',
          tags: ['Patient file'],
          params: patientCheckInsIdParamsDto,
          body: LogPatientFeedbackActionDto,
        },
      },
      controller.transition('actions'),
    );
  };
}
