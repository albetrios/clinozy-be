import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { SupplierCreditsService } from './supplier-credits.service.js';
import { createSupplierCreditsController } from './supplier-credits.controller.js';
import {
  CreateSupplierCreditDto,
  listSupplierCreditsQueryDto,
  supplierCreditsIdParamsDto,
} from './supplier-credits.dto.js';

/** Registers the `supplier-credits` routes (prefix `/api/v1/app`). */
export function supplierCreditsRoutes(service: SupplierCreditsService): FastifyPluginAsync {
  const controller = createSupplierCreditsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/supplier-credits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.SUPPLIER_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List supplier credits',
          description:
            "Returns one page of the active organization's supplier credits (newest first by default), with the total count; `q` searches, filters narrow. Requires supplier:read.",
          tags: ['Medical store'],
          querystring: listSupplierCreditsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/supplier-credits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.SUPPLIER_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create supplier credit',
          description:
            'Adds a supplier credit to the active organization. Requires supplier:update.',
          tags: ['Medical store'],
          body: CreateSupplierCreditDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { supplier_credit_id: string } }>(
      '/supplier-credits/:supplier_credit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.SUPPLIER_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get supplier credit',
          description:
            'Returns one supplier credit of the active organization. Requires supplier:read.',
          tags: ['Medical store'],
          params: supplierCreditsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.delete<{ Params: { supplier_credit_id: string } }>(
      '/supplier-credits/:supplier_credit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.SUPPLIER_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete supplier credit',
          description:
            "Soft-deletes a supplier credit with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires supplier:update.",
          tags: ['Medical store'],
          params: supplierCreditsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { supplier_credit_id: string } }>(
      '/supplier-credits/:supplier_credit_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.SUPPLIER_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore supplier credit',
          description:
            "Undoes a supplier credit's delete. A live supplier credit is a 409. Requires supplier:update.",
          tags: ['Medical store'],
          params: supplierCreditsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
