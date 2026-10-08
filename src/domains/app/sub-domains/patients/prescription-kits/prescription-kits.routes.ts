import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PrescriptionKitsService } from './prescription-kits.service.js';
import { createPrescriptionKitsController } from './prescription-kits.controller.js';
import {
  CreatePrescriptionKitDto,
  UpdatePrescriptionKitDto,
  listPrescriptionKitsQueryDto,
  prescriptionKitsIdParamsDto,
} from './prescription-kits.dto.js';

/** Registers the `prescription-kits` routes (prefix `/api/v1/app`) — routes-final 7.D, routes 21–26: a doctor's own kits, top-level (P11, P22). */
export function prescriptionKitsRoutes(service: PrescriptionKitsService): FastifyPluginAsync {
  const controller = createPrescriptionKitsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/prescription-kits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_CREATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List prescription kits',
          description:
            "Returns one page of the caller's own prescription kits (P17 — another member's never show; newest first by default, `sort=name` by name), with the total count on the first page; `q` matches the name. Requires patient_prescription:create.",
          tags: ['Patient file'],
          querystring: listPrescriptionKitsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/prescription-kits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create prescription kit',
          description:
            "Saves a kit of the caller's own: `name` (1–80) and `items` (up to 30 lines, a prescription's — a line's `medicine_id` must be a live medicine, a 400 on `items`). A name the caller already uses (any case) is a 409. A caller who is not a member is a 403 `not_a_member`. Requires patient_prescription:create.",
          tags: ['Patient file'],
          body: CreatePrescriptionKitDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { prescription_kit_id: string } }>(
      '/prescription-kits/:prescription_kit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_CREATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get prescription kit',
          description:
            "Returns one of the caller's kits — another member's is a 404. Requires patient_prescription:create.",
          tags: ['Patient file'],
          params: prescriptionKitsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { prescription_kit_id: string } }>(
      '/prescription-kits/:prescription_kit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_CREATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update prescription kit',
          description:
            "Changes a kit's `name` or `items` (at least one; `items` replaces the lines). A name the caller already uses is a 409. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` (D43). Requires patient_prescription:create.",
          tags: ['Patient file'],
          params: prescriptionKitsIdParamsDto,
          body: UpdatePrescriptionKitDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { prescription_kit_id: string } }>(
      '/prescription-kits/:prescription_kit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_CREATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete prescription kit',
          description:
            "Deletes one of the caller's kits with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires patient_prescription:create.",
          tags: ['Patient file'],
          params: prescriptionKitsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { prescription_kit_id: string } }>(
      '/prescription-kits/:prescription_kit_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_PRESCRIPTION_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore prescription kit',
          description:
            "Undoes a kit's delete. A live kit is a 409 `record_not_deleted`; a name reused meanwhile a 409 `record_restore_conflict`. Requires patient_prescription:create.",
          tags: ['Patient file'],
          params: prescriptionKitsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
