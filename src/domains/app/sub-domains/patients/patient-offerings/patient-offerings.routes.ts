import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PatientOfferingsService } from './patient-offerings.service.js';
import { createPatientOfferingsController } from './patient-offerings.controller.js';
import {
  UpdatePatientOfferingDto,
  listPatientOfferingsQueryDto,
  patientOfferingsIdParamsDto,
  patientOfferingsParentParamsDto,
} from './patient-offerings.dto.js';

/** The by-id routes' path params. */
type PatientOfferingParams = { Params: { patient_id: string; patient_offering_id: string } };

/**
 * Registers the `patient-offerings` routes (prefix `/api/v1/app`) — routes-final 7.L, routes
 * 65–67, nested under the patient. Bought only by invoicing (PK4) — no create, delete or restore.
 */
export function patientOfferingsRoutes(service: PatientOfferingsService): FastifyPluginAsync {
  const controller = createPatientOfferingsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/offerings',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List what a patient bought',
          description:
            "Returns one page of what a patient bought — each with `offering_name`, `sessions_left`, `is_package` (more than one session) and `status` (`active` — a session left, not expired · `used_up` · `expired`, past `valid_until` in the organization's time zone; PK5). The Packages tab is `is_package=true`. Filters: `status` (several, comma-separated), `offering_id`, `is_package`, the created range; sort `created_at` (default, newest first) or `valid_until` (no expiry last). Bought only by invoicing (PK4); sessions are spent only by treatments. Requires patient:read.",
          tags: ['Patient file'],
          params: patientOfferingsParentParamsDto,
          querystring: listPatientOfferingsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get<PatientOfferingParams>(
      '/patients/:patient_id/offerings/:patient_offering_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a bought offering',
          description:
            "Returns one of a patient's bought offerings — another patient's, or one whose invoice is deleted, is a 404. Requires patient:read.",
          tags: ['Patient file'],
          params: patientOfferingsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<PatientOfferingParams>(
      '/patients/:patient_id/offerings/:patient_offering_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a bought offering',
          description:
            "Changes a bought offering's `valid_until` (a date — never before its invoice's, a 400 — or null for no expiry) or `sessions_total` (1–999, never below `sessions_used` — a 400; a refund of unused sessions lowers it to what was spent, PK6). Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` (D43). Requires payment:update.",
          tags: ['Patient file'],
          params: patientOfferingsIdParamsDto,
          body: UpdatePatientOfferingDto,
        },
      },
      controller.update,
    );
  };
}
