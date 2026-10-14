import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { SupplierCreditsService } from './supplier-credits.service.js';
import { createSupplierCreditsController } from './supplier-credits.controller.js';
import {
  CreateSupplierCreditDto,
  listSupplierAccountCreditsQueryDto,
  listSupplierCreditsQueryDto,
  supplierCreditsIdParamsDto,
  supplierCreditsParentParamsDto,
  voidSupplierCreditQueryDto,
} from './supplier-credits.dto.js';

/** A supplier's credits' path params. */
type SupplierParams = { Params: { supplier_id: string } };
/** One credit's path params, under its supplier. */
type SupplierCreditParams = { Params: { supplier_id: string; supplier_credit_id: string } };

/** What every credit answer carries. */
const CREDIT_TEXT =
  "the supplier, medicine and batch names and `status` (`open` until fully applied to the supplier's dues, then `adjusted`)";
/** What the lists say about the query. */
const LIST_QUERY_TEXT =
  'Filters `medicine_id`, `status`, the created range (`created_from`, `created_to` — the latter exclusive); sorted newest first.';

/**
 * Registers the `supplier-credits` routes (prefix `/api/v1/app`) — routes-final 11.C, routes 14–16,
 * 54, 55 and 57: every credit (the Credits tab), and a supplier's — its list, create, read, void
 * and undo under `/suppliers/{supplier_id}/credits` (MD34).
 */
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
          description: `The Credits tab's supplier side: one page of the stock returned to every supplier and what each owes back, with ${CREDIT_TEXT}. Filters \`supplier_id\`, \`medicine_id\`, \`status\`, the created range (\`created_from\`, \`created_to\` — the latter exclusive); sorted newest first. A voided credit is not listed. Requires medicine:read.`,
          tags: ['Medical store'],
          querystring: listSupplierCreditsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get<SupplierParams>(
      '/suppliers/:supplier_id/credits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a supplier's credits",
          description: `A supplier's account: one page of the stock returned to it and what it owes back, with ${CREDIT_TEXT}. ${LIST_QUERY_TEXT} A voided credit is not listed; a removed or unknown supplier is a 404. Requires medicine:read.`,
          tags: ['Medical store'],
          params: supplierCreditsParentParamsDto,
          querystring: listSupplierAccountCreditsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<SupplierParams>(
      '/suppliers/:supplier_id/credits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Return stock to a supplier',
          description:
            "\"Return expiring stock\" to the path's supplier (a live one — a 404 otherwise): `medicine_batch_id*` and `quantity*` (1–9999) take the packs out of the batch — more than it holds is a 409 `not_enough_stock` — and record what the supplier owes back at the batch's purchase rate (`amount` = quantity × rate). The credit is applied at once to the supplier's received orders still due, oldest first; what is left stays open for orders received later. A credit is never changed — void it and return the stock again. Requires medicine:update.",
          tags: ['Medical store'],
          params: supplierCreditsParentParamsDto,
          body: CreateSupplierCreditDto,
        },
      },
      controller.create,
    );
    zodApplication.get<SupplierCreditParams>(
      '/suppliers/:supplier_id/credits/:supplier_credit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a supplier credit',
          description: `Returns one live credit of the supplier with what is applied of it — ${CREDIT_TEXT}. Another supplier's credit is a 404. Requires medicine:read.`,
          tags: ['Medical store'],
          params: supplierCreditsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.delete<SupplierCreditParams>(
      '/suppliers/:supplier_id/credits/:supplier_credit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Void a supplier credit',
          description:
            "Voids a credit with why: `reason` (mistake, wrong_quantity, supplier_refused, other) and a `note`, required for other. Its packs go back into their batch (past 9999 a 409 `batch_full`) and the credit comes off the supplier's orders — they are due again, and the supplier's other live credits are applied again oldest first, so what the store owes the supplier rises by the credit's amount. Another supplier's credit is a 404. Undo with restore. Requires medicine:delete.",
          tags: ['Medical store'],
          params: supplierCreditsIdParamsDto,
          querystring: voidSupplierCreditQueryDto,
        },
      },
      controller.remove,
    );
    zodApplication.post<SupplierCreditParams>(
      '/suppliers/:supplier_id/credits/:supplier_credit_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Undo a supplier credit void',
          description:
            "Undoes a void: the packs are taken out of the same batch again (no longer there is a 409 `not_enough_stock`) and the supplier's live credits are applied again oldest first — this one in its place. A live credit is a 409 `record_not_deleted`; another supplier's a 404. Requires medicine:delete.",
          tags: ['Medical store'],
          params: supplierCreditsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
