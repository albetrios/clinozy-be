import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PatientPrescriptionsService } from './patient-prescriptions.service.js';
import { createPatientPrescriptionsController } from './patient-prescriptions.controller.js';
import {
  CreatePatientPrescriptionDto,
  UpdatePatientPrescriptionDto,
  listPatientPrescriptionsQueryDto,
  patientPrescriptionsIdParamsDto,
  patientPrescriptionsParentParamsDto,
} from './patient-prescriptions.dto.js';

/** The by-id routes' path params. */
type PrescriptionParams = { Params: { patient_id: string; patient_prescription_id: string } };

/** What the lists say about their filters. */
const LIST_FILTERS =
  '`q` is a prescription number only (`RX-500`, `#500` — a 400 otherwise); filters `status`, `doctor_membership_id`, `appointment_id`, `prescription_date_from` / `prescription_date_to` (inclusive), the created range; sort `created_at` (default, newest first) or `prescription_date`.';

/**
 * Registers the `patient-prescriptions` routes (prefix `/api/v1/app`) — routes-final 7.C, routes
 * 13–20: the pharmacy queue top-level (P27), the rest nested under the patient (P11).
 */
export function patientPrescriptionsRoutes(
  service: PatientPrescriptionsService,
): FastifyPluginAsync {
  const controller = createPatientPrescriptionsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/patient-prescriptions',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List prescriptions — the pharmacy queue',
          description: `Returns one page of the organization's prescriptions across patients — the pharmacy queue (\`status=approved\`), with the total count on the first page. ${LIST_FILTERS} \`patient_id\` keeps one patient's. Requires patient_prescription:read.`,
          tags: ['Patient file'],
          querystring: listPatientPrescriptionsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/prescriptions',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's prescriptions",
          description: `Returns one page of a patient's prescriptions. ${LIST_FILTERS} The path's patient wins over \`?patient_id=\` (TR3); a removed or unknown patient is a 404. Requires patient_prescription:read.`,
          tags: ['Patient file'],
          params: patientPrescriptionsParentParamsDto,
          querystring: listPatientPrescriptionsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/prescriptions',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Write a prescription',
          description:
            "Writes a draft prescription for a patient: `doctor_membership_id` and `prescription_date`; optional `appointment_id` (a visit of the patient's — a 400 otherwise), `items` (up to 30 lines; a line's `medicine_id` must be a live medicine — a 400 on `items`, P15, P16), `advice`, `lab_report`, `procedure_today` (up to 2000 each), `follow_up_date`, `print_language`. Numbered `RX-<n>` per organization. Requires patient_prescription:create.",
          tags: ['Patient file'],
          params: patientPrescriptionsParentParamsDto,
          body: CreatePatientPrescriptionDto,
        },
      },
      controller.create,
    );
    zodApplication.get<PrescriptionParams>(
      '/patients/:patient_id/prescriptions/:patient_prescription_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a prescription',
          description:
            "Returns one of a patient's prescriptions with its lines — another patient's is a 404. Requires patient_prescription:read.",
          tags: ['Patient file'],
          params: patientPrescriptionsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<PrescriptionParams>(
      '/patients/:patient_id/prescriptions/:patient_prescription_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a draft prescription',
          description:
            'Changes any field of a draft (at least one; null clears an optional one; `items` replaces the lines). An approved prescription is final — a 409 `prescription_approved` (P15). Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` (D43). Requires patient_prescription:update.',
          tags: ['Patient file'],
          params: patientPrescriptionsIdParamsDto,
          body: UpdatePatientPrescriptionDto,
        },
      },
      controller.update,
    );
    zodApplication.post<PrescriptionParams>(
      '/patients/:patient_id/prescriptions/:patient_prescription_id/approve',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Approve a prescription',
          description:
            "Approves a draft — final from then on: `status` `approved`, `approved_at` now and `approved_by_membership_id` the caller (a member — a 403 `not_a_member` otherwise, P15). A draft with no line is a 400 on `items`; a prescription that is not a draft a 409 `transition_not_allowed`. A `system` entry joins the contact's activity, shown to prescription readers (M10). Requires patient_prescription:update.",
          tags: ['Patient file'],
          params: patientPrescriptionsIdParamsDto,
        },
      },
      controller.transition('approve'),
    );
    zodApplication.delete<PrescriptionParams>(
      '/patients/:patient_id/prescriptions/:patient_prescription_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a draft prescription',
          description:
            "Deletes a draft with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. An approved prescription is final — a 409 `prescription_approved` (P15). Restorable until the organization's purge window ends (D38). Requires patient_prescription:delete.",
          tags: ['Patient file'],
          params: patientPrescriptionsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<PrescriptionParams>(
      '/patients/:patient_id/prescriptions/:patient_prescription_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a draft prescription',
          description:
            "Undoes a draft's delete. A live prescription is a 409 `record_not_deleted`. Requires patient_prescription:delete.",
          tags: ['Patient file'],
          params: patientPrescriptionsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
