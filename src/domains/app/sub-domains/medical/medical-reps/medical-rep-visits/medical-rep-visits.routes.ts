import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { MedicalRepVisitsService } from './medical-rep-visits.service.js';
import { createMedicalRepVisitsController } from './medical-rep-visits.controller.js';
import {
  CreateMedicalRepVisitDto,
  listMedicalRepVisitsQueryDto,
  medicalRepVisitsIdParamsDto,
  medicalRepVisitsParentParamsDto,
} from './medical-rep-visits.dto.js';

/** The nested list and log routes' path params. */
type MedicalRepParams = { Params: { medical_rep_id: string } };
/** The by-id routes' path params. */
type MedicalRepVisitParams = { Params: { medical_rep_id: string; medical_rep_visit_id: string } };

/**
 * Registers an MR's visit routes (prefix `/api/v1/app`) — routes-final 11.G, routes 39–43, nested
 * under the MR.
 */
export function medicalRepVisitsRoutes(service: MedicalRepVisitsService): FastifyPluginAsync {
  const controller = createMedicalRepVisitsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<MedicalRepParams>(
      '/medical-reps/:medical_rep_id/visits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List an MR's visits",
          description:
            "Returns one page of an MR's logged visits, sorted `visit_date` (default, newest first) or `created_at`. A removed or unknown MR is a 404. Requires medicine:read.",
          tags: ['Medical store'],
          params: medicalRepVisitsParentParamsDto,
          querystring: listMedicalRepVisitsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<MedicalRepParams>(
      '/medical-reps/:medical_rep_id/visits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Log an MR visit',
          description:
            "Logs a visit — all optional: `visit_date` (today unless sent, never after it), `next_visit_on` (after the visit, at most 120 days on — a 400 otherwise), `samples` (≤ 120), `notes` (≤ 500); the caller is its author. It sets the MR's next visit, or clears it when none is sent and theirs was on or before the visit — the reminder task follows. A visit is never changed. Requires medicine:create.",
          tags: ['Medical store'],
          params: medicalRepVisitsParentParamsDto,
          body: CreateMedicalRepVisitDto,
        },
      },
      controller.create,
    );
    zodApplication.get<MedicalRepVisitParams>(
      '/medical-reps/:medical_rep_id/visits/:medical_rep_visit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get an MR visit',
          description:
            "Returns one of an MR's visits — another MR's is a 404. Requires medicine:read.",
          tags: ['Medical store'],
          params: medicalRepVisitsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.delete<MedicalRepVisitParams>(
      '/medical-reps/:medical_rep_id/visits/:medical_rep_visit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete an MR visit',
          description:
            "Deletes a visit with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. The MR's next visit stays as it is. Restorable until the organization's purge window ends. Requires medicine:delete.",
          tags: ['Medical store'],
          params: medicalRepVisitsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<MedicalRepVisitParams>(
      '/medical-reps/:medical_rep_id/visits/:medical_rep_visit_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore an MR visit',
          description:
            "Undoes a visit's delete. A live one is a 409 `record_not_deleted`. Requires medicine:delete.",
          tags: ['Medical store'],
          params: medicalRepVisitsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
