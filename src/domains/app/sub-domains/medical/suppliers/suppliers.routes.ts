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
  PaySupplierDto,
  UpdateSupplierDto,
  listSuppliersQueryDto,
  suppliersIdParamsDto,
} from './suppliers.dto.js';

/** The by-id routes' path params. */
type SupplierParams = { Params: { supplier_id: string } };

/** Registers the `suppliers` routes (prefix `/api/v1/app`) — routes-final 11.B, routes 7–13. */
export function suppliersRoutes(service: SuppliersService): FastifyPluginAsync {
  const controller = createSuppliersController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/suppliers',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List suppliers',
          description:
            "Returns one page of the medical store's suppliers — the Suppliers tab and the picker — each with its manufacturers, `payable` (received orders' dues less open credits), `ageing_days` (since the oldest order still due) and `order_count`. `q` searches the name and phone; `manufacturer_id` and `has_payable` narrow; sort `name` (default, A–Z), `payable` (most owed first) or `created_at`. Requires medicine:read.",
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a supplier',
          description:
            'Adds an agency the store buys from — never the clinic stock\'s vendors: `name*` (1–120, unique in any case — a 409 `record_already_exists`); optional `phone` (`+91` and ten digits), `gst_number` (a GSTIN), `manufacturer_ids` ("Distributes", up to 50 live manufacturers — a 400 otherwise), `is_quick` (a picker\'s inline add). Requires medicine:create.',
          tags: ['Medical store'],
          body: CreateSupplierDto,
        },
      },
      controller.create,
    );
    zodApplication.get<SupplierParams>(
      '/suppliers/:supplier_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a supplier',
          description:
            'Returns one supplier with what is owed (`payable`, `ageing_days`), its orders and manufacturers. Requires medicine:read.',
          tags: ['Medical store'],
          params: suppliersIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<SupplierParams>(
      '/suppliers/:supplier_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a supplier',
          description:
            "Changes a supplier's `name` (unique — a 409 `record_already_exists`), `phone`, `gst_number` (null clears either) or `manufacturer_ids` (replaces the links). Send `expected_updated_at` and a save over a newer change is a 409 `record_changed`. Requires medicine:update.",
          tags: ['Medical store'],
          params: suppliersIdParamsDto,
          body: UpdateSupplierDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<SupplierParams>(
      '/suppliers/:supplier_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a supplier',
          description:
            "Deletes a supplier with nothing owed — something payable, an open credit or an order waiting to be received is a 409 `supplier_has_dues` — with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Its orders and credits keep it. Restorable until the organization's purge window ends. Requires medicine:delete.",
          tags: ['Medical store'],
          params: suppliersIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<SupplierParams>(
      '/suppliers/:supplier_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a supplier',
          description:
            "Undoes a supplier's delete. A live one is a 409 `record_not_deleted`; its name taken meanwhile a 409 `record_restore_conflict`. Requires medicine:delete.",
          tags: ['Medical store'],
          params: suppliersIdParamsDto,
        },
      },
      controller.restore,
    );
    zodApplication.post<SupplierParams>(
      '/suppliers/:supplier_id/payments',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Pay a supplier',
          description:
            '"Pay ₹827": `branch_id*` (the paying branch, one of yours — a 400 otherwise) and `splits*` (1–3 of cash · UPI · card, each once) pay the supplier\'s received orders still due, oldest first — one `supplier_bill` payment per order, pointing at it, after their open credits are applied. More than is payable (or nothing due) is a 409 `more_than_due`; optional `paid_at` must fall on an open day (a 409 `day_closed`), with a `reference` and `note`. Answers with the supplier. Requires payment:create.',
          tags: ['Medical store'],
          params: suppliersIdParamsDto,
          body: PaySupplierDto,
        },
      },
      controller.transition('payments'),
    );
  };
}
