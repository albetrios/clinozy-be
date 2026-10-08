import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { LogPatientFeedbackActionDto } from '@/domains/app/sub-domains/patients/patient-feedback-actions/patient-feedback-actions.dto.js';
import type { PatientReviewsService } from './patient-reviews.service.js';
import { createPatientReviewsController } from './patient-reviews.controller.js';
import {
  CreatePatientReviewDto,
  UpdatePatientReviewDto,
  listPatientReviewsQueryDto,
  patientReviewsIdParamsDto,
  patientReviewsParentParamsDto,
} from './patient-reviews.dto.js';

/** The by-id routes' path params. */
type ReviewParams = { Params: { patient_id: string; patient_review_id: string } };

/**
 * Registers the `patient-reviews` routes (prefix `/api/v1/app`) — routes-final 7.J, routes
 * 57–62, and 7.K route 64 (an action logged under a review), nested under the patient.
 */
export function patientReviewsRoutes(service: PatientReviewsService): FastifyPluginAsync {
  const controller = createPatientReviewsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/reviews',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's reviews",
          description:
            "Returns one page of a patient's reviews (newest `review_date` first; `sort=created_at` by logging time), each with `actions` (what was done about it, newest first) and `needs_action` — a rating ≤ 3 with no action logged (TR11). Filters: `source` (several, comma-separated), `needs_action`, `review_date_from` / `review_date_to` (whole days, inclusive), the created range. Requires patient:read.",
          tags: ['Patient file'],
          params: patientReviewsParentParamsDto,
          querystring: listPatientReviewsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/reviews',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Log a review',
          description:
            "Logs a review the patient gave: `source*` (`google` · `video` · `instagram` · `internal_form` · `whatsapp`); optional `review_date` (default the organization's today, never in the future), `rating` (1–5), `text` (≤ 2,000), `link` (`https://` only — a 400 otherwise, TR11), `file_keys` (up to 10 confirmed uploads of the organization — a 400 otherwise), `appointment_id` (the patient's contact's — a 400 otherwise). A `system` entry joins the contact's activity; a rating ≤ 3 also creates a doctor call-back task. Requires patient:update.",
          tags: ['Patient file'],
          params: patientReviewsParentParamsDto,
          body: CreatePatientReviewDto,
        },
      },
      controller.create,
    );
    zodApplication.get<ReviewParams>(
      '/patients/:patient_id/reviews/:patient_review_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a review',
          description:
            "Returns one of a patient's reviews with its actions — another patient's, or a deleted one, is a 404. Requires patient:read.",
          tags: ['Patient file'],
          params: patientReviewsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<ReviewParams>(
      '/patients/:patient_id/reviews/:patient_review_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a review',
          description:
            'Changes a review — any field of the log (at least one; null clears an optional one), with the same checks. An edit that lowers the rating to 3 or less adds a call-back task. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` (D43). Requires patient:update.',
          tags: ['Patient file'],
          params: patientReviewsIdParamsDto,
          body: UpdatePatientReviewDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<ReviewParams>(
      '/patients/:patient_id/reviews/:patient_review_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a review',
          description:
            "Deletes a review with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires patient:update.",
          tags: ['Patient file'],
          params: patientReviewsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<ReviewParams>(
      '/patients/:patient_id/reviews/:patient_review_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a review',
          description:
            "Undoes a review's delete. A live review is a 409 `record_not_deleted`. Requires patient:update.",
          tags: ['Patient file'],
          params: patientReviewsIdParamsDto,
        },
      },
      controller.restore,
    );
    zodApplication.post<ReviewParams>(
      '/patients/:patient_id/reviews/:patient_review_id/actions',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Log a review action',
          description:
            'Logs what was done about a review: `action*` (`doctor_called` · `asked_revisit` · `free_review_booked` · `plan_changed` · `replied_google` · `replied_instagram` · `replied_whatsapp` · `refund_credit` · `other`) and `note` (1–280, required for other — a 400 otherwise); the caller is the author. Append-only — a wrong one is followed by a right one (TR12); the first turns `needs_action` off. Answers the review with its `actions`, the new one first. A review of another patient, or a deleted one, is a 404. Requires patient:update.',
          tags: ['Patient file'],
          params: patientReviewsIdParamsDto,
          body: LogPatientFeedbackActionDto,
        },
      },
      controller.transition('actions'),
    );
  };
}
