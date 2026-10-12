import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PatientTreatmentsService } from './patient-treatments.service.js';
import { createPatientTreatmentsController } from './patient-treatments.controller.js';
import {
  CreatePatientTreatmentDto,
  ReversePatientTreatmentDto,
  UpdatePatientTreatmentDto,
  listPatientTreatmentsQueryDto,
  patientTreatmentsIdParamsDto,
  patientTreatmentsParentParamsDto,
} from './patient-treatments.dto.js';

/** The by-id routes' path params. */
type TreatmentParams = { Params: { patient_id: string; patient_treatment_id: string } };

/** What the lists say about their filters. */
const LIST_FILTERS =
  "Each with `is_billed` (TR13 — `true` with a bought offering, `false` for a done session with an offering and none, null otherwise) and `latest_check_in` (`{ id, feel, score, check_in_date }` or null — the Feedback column). Filters: `doctor_membership_id`, `therapist_membership_id`, `appointment_id`, `offering_id`, `patient_offering_id`, `is_billed` (the visit's items ready, work done but not billed), `status`, `performed_from` / `performed_to` (whole days in the organization's time zone, inclusive), `q` (the name), the created range; sort `performed_at` (default, newest first) or `created_at`.";

/**
 * Registers the `patient-treatments` routes (prefix `/api/v1/app`) — routes-final 7.H, routes
 * 45–50: every patient's sessions top-level, the rest nested under the patient.
 */
export function patientTreatmentsRoutes(service: PatientTreatmentsService): FastifyPluginAsync {
  const controller = createPatientTreatmentsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/patient-treatments',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_TREATMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List every patient's treatments",
          description: `Returns one page of the organization's treatment sessions across patients — a doctor's or a therapist's sessions, with the total count on the first page. ${LIST_FILTERS} \`patient_id\` keeps one patient's. Requires patient_treatment:read.`,
          tags: ['Patient file'],
          querystring: listPatientTreatmentsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/treatments',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_TREATMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's treatments",
          description: `Returns one page of a patient's treatment sessions. ${LIST_FILTERS} The path's patient wins over \`?patient_id=\` (TR3); a removed or unknown patient is a 404. Requires patient_treatment:read.`,
          tags: ['Patient file'],
          params: patientTreatmentsParentParamsDto,
          querystring: listPatientTreatmentsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/treatments',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_TREATMENT_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Record a treatment session',
          description:
            "Records a session: `name*` (1–120); optional `appointment_id` (a checked-in or completed visit of the patient's — a 400 otherwise), `offering_id` (active — a 400 otherwise, O13), `template` (`skin` default · `dental` · `physio` · `gynac` · `general`), `performed_at` (default now, never in the future), `doctor_membership_id`, `therapist_membership_id`, `body_parts` (the patient file's 15 parts, up to 12), `session_number` (1–999), `parameters` (the template's detail — string values up to 80), `remark` (≤ 2,000), `aftercare_call` (`none` · `next_day` default · `in_two_days` · `in_week`), and `patient_offering_id` — the patient's bought offering it spends (TR7): its offering becomes the session's (another one sent is a 400), one session is taken (a 409 `offering_expired` past its `valid_until`, `offering_used_up` with none left) and its count becomes `session_number` (not sent with it — a 400). The patient's first session converts the file (P4); a `system` entry joins the contact's activity. Requires patient_treatment:create.",
          tags: ['Patient file'],
          params: patientTreatmentsParentParamsDto,
          body: CreatePatientTreatmentDto,
        },
      },
      controller.create,
    );
    zodApplication.get<TreatmentParams>(
      '/patients/:patient_id/treatments/:patient_treatment_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_TREATMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a treatment session',
          description:
            "Returns one of a patient's sessions with `is_billed` and `latest_check_in` — another patient's is a 404. Requires patient_treatment:read.",
          tags: ['Patient file'],
          params: patientTreatmentsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<TreatmentParams>(
      '/patients/:patient_id/treatments/:patient_treatment_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_TREATMENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a treatment session',
          description:
            'Changes a session — any field of the record but `patient_offering_id` (at least one; null clears an optional one), with the same checks; a session spent from a bought offering keeps its `session_number` and `offering_id` (a 400 — reverse it and record it again, TR7). A reversed session is a 409 `treatment_reversed`. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` (D43). Requires patient_treatment:update.',
          tags: ['Patient file'],
          params: patientTreatmentsIdParamsDto,
          body: UpdatePatientTreatmentDto,
        },
      },
      controller.update,
    );
    zodApplication.post<TreatmentParams>(
      '/patients/:patient_id/treatments/:patient_treatment_id/reverse',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_TREATMENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Reverse a treatment session',
          description:
            "Reverses a cancelled or wrong session with `reason*` (1–280) — final, never deleted (TR6): `status` `reversed`, `reversed_at` stamped, and a spent session given back to its bought offering (the link cleared, so a wrong bill can be fixed). A reversed session is a 409 `transition_not_allowed`. A `system` entry joins the contact's activity. Requires patient_treatment:update.",
          tags: ['Patient file'],
          params: patientTreatmentsIdParamsDto,
          body: ReversePatientTreatmentDto,
        },
      },
      controller.transition('reverse'),
    );
  };
}
