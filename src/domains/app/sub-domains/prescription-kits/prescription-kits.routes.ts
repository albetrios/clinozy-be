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

/** Registers the `prescription-kits` routes (prefix `/api/v1/app`). */
export function prescriptionKitsRoutes(service: PrescriptionKitsService): FastifyPluginAsync {
  const controller = createPrescriptionKitsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/prescription-kits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_CREATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List prescription kits',
          description:
            "Returns one page of the active organization's prescription kits (newest first by default), with the total count; `q` searches, filters narrow. Requires prescription:create.",
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create prescription kit',
          description:
            'Adds a prescription kit to the active organization. Requires prescription:create.',
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_CREATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get prescription kit',
          description:
            'Returns one prescription kit of the active organization. Requires prescription:create.',
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_CREATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update prescription kit',
          description:
            "Changes any of a prescription kit's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires prescription:create.",
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_CREATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete prescription kit',
          description:
            "Soft-deletes a prescription kit with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires prescription:create.",
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore prescription kit',
          description:
            "Undoes a prescription kit's delete. A live prescription kit is a 409. Requires prescription:create.",
          tags: ['Patient file'],
          params: prescriptionKitsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
