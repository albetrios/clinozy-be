import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { MedicalRepsService } from './medical-reps.service.js';
import { createMedicalRepsController } from './medical-reps.controller.js';
import {
  CreateMedicalRepDto,
  UpdateMedicalRepDto,
  listMedicalRepsQueryDto,
  medicalRepsIdParamsDto,
} from './medical-reps.dto.js';

/** The by-id routes' path params. */
type MedicalRepParams = { Params: { medical_rep_id: string } };

/** Registers the `medical-reps` routes (prefix `/api/v1/app`) — routes-final 11.F, routes 33–38. */
export function medicalRepsRoutes(service: MedicalRepsService): FastifyPluginAsync {
  const controller = createMedicalRepsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/medical-reps',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List medical reps',
          description:
            "Returns one page of the store's MRs — the MRs tab and the picker — each with its manufacturers, `next_visit_on`, `is_visit_overdue` and its latest visit (`last_visit_on`, `last_samples`). `q` searches the name and phone; `manufacturer_id` and `is_visit_overdue` narrow; sort `name` (default, A–Z), `next_visit_on` (none last) or `created_at`. Requires medicine:read.",
          tags: ['Medical store'],
          querystring: listMedicalRepsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/medical-reps',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a medical rep',
          description:
            'Adds an MR: `name*` (1–120 — not unique); optional `phone` (`+91` and ten digits), `next_visit_on` (today to 120 days on — a 400 otherwise; the pharmacist\'s reminder task opens that day), `manufacturer_ids` ("Represents", up to 20 live manufacturers). Requires medicine:create.',
          tags: ['Medical store'],
          body: CreateMedicalRepDto,
        },
      },
      controller.create,
    );
    zodApplication.get<MedicalRepParams>(
      '/medical-reps/:medical_rep_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a medical rep',
          description:
            'Returns one MR with its latest visit and manufacturers. Requires medicine:read.',
          tags: ['Medical store'],
          params: medicalRepsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<MedicalRepParams>(
      '/medical-reps/:medical_rep_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a medical rep',
          description:
            "Changes an MR's `name`, `phone`, `next_visit_on` (`null` clears either; the window as on add) or `manufacturer_ids` (replaces the links). Send `expected_updated_at` and a save over a newer change is a 409 `record_changed`. Requires medicine:update.",
          tags: ['Medical store'],
          params: medicalRepsIdParamsDto,
          body: UpdateMedicalRepDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<MedicalRepParams>(
      '/medical-reps/:medical_rep_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a medical rep',
          description:
            "Deletes an MR (their visits stay with them), with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends. Requires medicine:delete.",
          tags: ['Medical store'],
          params: medicalRepsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<MedicalRepParams>(
      '/medical-reps/:medical_rep_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a medical rep',
          description:
            "Undoes an MR's delete. A live one is a 409 `record_not_deleted`. Requires medicine:delete.",
          tags: ['Medical store'],
          params: medicalRepsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
