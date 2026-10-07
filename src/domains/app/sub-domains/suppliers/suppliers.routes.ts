import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { SuppliersService } from './suppliers.service.js';
import { createSuppliersController } from './suppliers.controller.js';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  listSuppliersQueryDto,
  suppliersIdParamsDto,
} from './suppliers.dto.js';

/** Registers the `suppliers` routes (prefix `/api/v1/app`). */
export function suppliersRoutes(service: SuppliersService): FastifyPluginAsync {
  const controller = createSuppliersController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/suppliers',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.SUPPLIER_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List suppliers',
          description:
            "Returns one page of the active organization's suppliers (newest first by default), with the total count; `q` searches, filters narrow. Requires supplier:read.",
          tags: ['Medical store'],
          querystring: listSuppliersQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/suppliers',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.SUPPLIER_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create supplier',
          description: 'Adds a supplier to the active organization. Requires supplier:create.',
          tags: ['Medical store'],
          body: CreateSupplierDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { supplier_id: string } }>(
      '/suppliers/:supplier_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.SUPPLIER_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get supplier',
          description: 'Returns one supplier of the active organization. Requires supplier:read.',
          tags: ['Medical store'],
          params: suppliersIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { supplier_id: string } }>(
      '/suppliers/:supplier_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.SUPPLIER_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update supplier',
          description:
            "Changes any of a supplier's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires supplier:update.",
          tags: ['Medical store'],
          params: suppliersIdParamsDto,
          body: UpdateSupplierDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { supplier_id: string } }>(
      '/suppliers/:supplier_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.SUPPLIER_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete supplier',
          description:
            "Soft-deletes a supplier with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires supplier:delete.",
          tags: ['Medical store'],
          params: suppliersIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { supplier_id: string } }>(
      '/suppliers/:supplier_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.SUPPLIER_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore supplier',
          description:
            "Undoes a supplier's delete. A live supplier is a 409. Requires supplier:delete.",
          tags: ['Medical store'],
          params: suppliersIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
