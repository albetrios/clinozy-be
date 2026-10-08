import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PatientOfferingSuggestionsService } from './patient-offering-suggestions.service.js';
import { createPatientOfferingSuggestionsController } from './patient-offering-suggestions.controller.js';
import {
  CreatePatientOfferingSuggestionDto,
  UpdatePatientOfferingSuggestionDto,
  listPatientOfferingSuggestionsQueryDto,
  patientOfferingSuggestionsIdParamsDto,
  patientOfferingSuggestionsParentParamsDto,
} from './patient-offering-suggestions.dto.js';

/** The by-id routes' path params. */
type SuggestionParams = {
  Params: { patient_id: string; patient_offering_suggestion_id: string };
};

/**
 * Registers the `patient-offering-suggestions` routes (prefix `/api/v1/app`) — routes-final 7.M,
 * routes 68–73, nested under the patient.
 */
export function patientOfferingSuggestionsRoutes(
  service: PatientOfferingSuggestionsService,
): FastifyPluginAsync {
  const controller = createPatientOfferingSuggestionsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/offering-suggestions',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's plan",
          description:
            'Returns one page of a patient\'s plan (newest first), each with `offering_name`, `source_label` ("Check-in · 26 Sep", "Appt #2790 · Consultation", else "Patient file" — PK8), `is_below_lowest_price` (a `price` below the offering\'s lowest price × quantity — a warning; the invoice refuses it), `invoiced_quantity` and `is_fully_invoiced` (from the invoice lines that name it, PK7), and `meta.plan_total` — the planned and accepted rows\' price, or the offering\'s billed price × quantity (PK9). Filters: `status` (several, comma-separated), `appointment_id` (the visit\'s "Plan ready"), `patient_check_in_id`, the created range. Requires patient:read.',
          tags: ['Patient file'],
          params: patientOfferingSuggestionsParentParamsDto,
          querystring: listPatientOfferingSuggestionsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/offering-suggestions',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add to the plan',
          description:
            "Adds an offering to the patient's plan: `offering_id*` (active — a 400 otherwise, O13); optional `quantity` (1–99, default 1), `price` (the whole quantity's final amount; none = the billed price × quantity), `status` (`planned` default · `accepted` · `next_time` · `declined`), `reason` (≤ 200), `appointment_id` (the visit it was planned at — the patient's contact's, a 400 otherwise). The caller is `suggested_by_membership_id`. The offering already in the plan — planned, next time, or accepted and not fully invoiced — is a 409 `suggestion_exists`; a declined row stays as a record (PK9). Requires patient:update.",
          tags: ['Patient file'],
          params: patientOfferingSuggestionsParentParamsDto,
          body: CreatePatientOfferingSuggestionDto,
        },
      },
      controller.create,
    );
    zodApplication.get<SuggestionParams>(
      '/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a plan row',
          description:
            "Returns one row of a patient's plan — another patient's, or a deleted one, is a 404. Requires patient:read.",
          tags: ['Patient file'],
          params: patientOfferingSuggestionsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<SuggestionParams>(
      '/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a plan row',
          description:
            "Changes a plan row's `quantity`, `price`, `status` or `reason` (at least one; null clears `price` or `reason`; the offering can't change — a 400). Moving a declined row back while another row holds the offering is a 409 `suggestion_exists` (PK9). Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` (D43). Requires patient:update.",
          tags: ['Patient file'],
          params: patientOfferingSuggestionsIdParamsDto,
          body: UpdatePatientOfferingSuggestionDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<SuggestionParams>(
      '/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Remove from the plan',
          description:
            "Removes a plan row with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other (PK10). Restorable until the organization's purge window ends (D38). Requires patient:update.",
          tags: ['Patient file'],
          params: patientOfferingSuggestionsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<SuggestionParams>(
      '/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a plan row',
          description:
            "Undoes a plan row's removal. A live row is a 409 `record_not_deleted`; one whose offering another row now holds is a 409 `suggestion_exists` (PK9). Requires patient:update.",
          tags: ['Patient file'],
          params: patientOfferingSuggestionsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
