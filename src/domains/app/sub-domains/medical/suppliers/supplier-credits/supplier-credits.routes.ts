import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { SupplierCreditsService } from './supplier-credits.service.js';
import { createSupplierCreditsController } from './supplier-credits.controller.js';
import {
  CreateSupplierCreditDto,
  listSupplierCreditsQueryDto,
  supplierCreditsIdParamsDto,
} from './supplier-credits.dto.js';

/** Registers the `supplier-credits` routes (prefix `/api/v1/app`) — routes-final 11.C, routes 14–16. */
export function supplierCreditsRoutes(service: SupplierCreditsService): FastifyPluginAsync {
  const controller = createSupplierCreditsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/supplier-credits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List supplier credits',
          description:
            "Returns one page of the stock returned to suppliers and what each owes back — a supplier's account — with the supplier, medicine and batch names and `status` (`open` until fully applied to their dues, then `adjusted`). Filters `supplier_id`, `medicine_id`, `status`; sorted newest first. Requires medicine:read.",
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Return stock to a supplier',
          description:
            '"Return expiring stock": `medicine_batch_id*`, `supplier_id*` (a live supplier) and `quantity*` (1–9999) take the packs out of the batch — more than it holds is a 409 `not_enough_stock` — and record what the supplier owes back at the batch\'s purchase rate (`amount` = quantity × rate). The credit is applied at once to the supplier\'s received orders still due, oldest first; what is left stays open for orders received later. A credit is never changed or deleted. Requires medicine:update.',
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a supplier credit',
          description:
            'Returns one supplier credit with what is applied of it. Requires medicine:read.',
          tags: ['Medical store'],
          params: supplierCreditsIdParamsDto,
        },
      },
      controller.get,
    );
  };
}
