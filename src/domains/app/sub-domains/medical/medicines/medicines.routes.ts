import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { MedicinesService } from './medicines.service.js';
import { createMedicinesController } from './medicines.controller.js';
import {
  CreateMedicineDto,
  NearExpiryDiscountDto,
  UpdateMedicineDto,
  listMedicinesQueryDto,
  medicinesIdParamsDto,
} from './medicines.dto.js';

/** The by-id routes' path params. */
type MedicineParams = { Params: { medicine_id: string } };

/** What every list and export description says about the query. */
const LIST_QUERY_TEXT =
  '`q` searches the name and composition, or the number (`#458`); filters `manufacturer_id` and `stock_level` (`ok`, `low` — at or under "Reorder at" — `out`; several, comma-separated), `expiring_within_days` (30, 60, 90 — a stocked batch\'s month ends within it), `supplier_id` (a price from them), `is_quick`, the created range; sort `name` (default, A–Z), `medicine_number`, `quantity`, `mrp`, `nearest_expiry` (none last), `manufacturer_name` (A–Z, none last), `margin_percent` (highest first, none last) or `created_at`.';

/** Registers the `medicines` routes (prefix `/api/v1/app`) — routes-final 11.D, routes 17–24. */
export function medicinesRoutes(service: MedicinesService): FastifyPluginAsync {
  const controller = createMedicinesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/medicines',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List medicines',
          description: `Returns one page of the store's medicines — the Medicines tab and the pickers — each with \`hsn_code\`, \`pack_label\`, \`units_per_pack\`, its stock (\`quantity\` — in units, packs while \`units_per_pack\` is 1 — and \`stock_level\`), batches with stock (each with the \`mrp\` printed on it, earliest expiry first), \`nearest_expiry\`, supplier prices, \`best_rate\` and \`margin_percent\`. ${LIST_QUERY_TEXT} Requires medicine:read.`,
          tags: ['Medical store'],
          querystring: listMedicinesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get(
      '/medicines/exports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export medicines',
          description: `The medicines CSV (\`medicines-YYYY-MM-DD.csv\`, up to 5,000 rows — \`is_truncated\` when more matched), with the list's filters and sort. ${LIST_QUERY_TEXT} Requires medicine:export and medicine:read.`,
          tags: ['Medical store'],
          querystring: listMedicinesQueryDto,
        },
      },
      controller.export,
    );
    zodApplication.post(
      '/medicines',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a medicine',
          description:
            'Adds a medicine: `name*` (1–120, unique in any case — a 409 `record_already_exists`), `mrp*` (GST inside, above 0) and `manufacturer_id*` — both optional when `is_quick`; optional `composition`, `is_prescription_only`, `hsn_code` (4, 6 or 8 digits), `pack_label` (1–30, as printed — a bill line snapshots it), `units_per_pack` (1–1000, default 1; above 1 the medicine sells loose and its stock, levels and batch quantities count units), `gst_percent` (0, 5, 12 — the default — 18, 28), `min_stock` ("Reorder at", default 2) and `max_stock` ("Fill up to", default 10, never under it — a 400), `near_expiry_discount_percent` (1–90), `batches` (up to 50: `batch_number*`, `expiry_month*` `YYYY-MM`, `quantity*` 0–9999, `purchase_rate`, `mrp` (printed on the batch, above 0 — a sale charges it), `supplier_id`) and `supplier_prices` (up to 20: `supplier_id*`, `rate*`, `free_quantity`, `lead_days`). The batches make its stock. Requires medicine:create.',
          tags: ['Medical store'],
          body: CreateMedicineDto,
        },
      },
      controller.create,
    );
    zodApplication.post(
      '/medicines/near-expiry-discount',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Set the near-expiry discount',
          description:
            '"Sell all at 20% off": sets `discount_percent*` (1–90, or `null` to remove it) as the near-expiry discount of every live medicine with a stocked batch whose month ends within `expiring_within_days*` (30, 60 or 90) — a new sale line\'s default discount. Answers `{ updated_count }`. Requires medicine:update.',
          tags: ['Medical store'],
          body: NearExpiryDiscountDto,
        },
      },
      controller.collectionAction('near-expiry-discount'),
    );
    zodApplication.get<MedicineParams>(
      '/medicines/:medicine_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a medicine',
          description:
            'Returns one medicine with its HSN code, pack label, units per pack, its batches (each with its MRP), supplier prices, nearest expiry, best rate and margin. Requires medicine:read.',
          tags: ['Medical store'],
          params: medicinesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<MedicineParams>(
      '/medicines/:medicine_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a medicine',
          description:
            "Changes any field of the add but `is_quick` (a quick medicine loses the flag once its MRP and composition are set; `null` clears the composition, the HSN code, the pack label and the discount; `units_per_pack` changes only while the medicine holds no stock — a 409 `medicine_has_stock`). `batches` is the whole list: a kept batch (its `id` — another medicine's is a 400) changes its details and its quantity moves by the difference, a new one is added, one left out goes to zero; a batch number the medicine already holds is a 409 `record_already_exists`. `supplier_prices` replaces the prices. Send `expected_updated_at` and a save over a newer change (a sale meanwhile) is a 409 `record_changed`. Requires medicine:update.",
          tags: ['Medical store'],
          params: medicinesIdParamsDto,
          body: UpdateMedicineDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<MedicineParams>(
      '/medicines/:medicine_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a medicine',
          description:
            "Deletes a medicine at zero stock (stock left is a 409 `medicine_has_stock`), with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Bills and orders keep naming it. Restorable until the organization's purge window ends. Requires medicine:delete.",
          tags: ['Medical store'],
          params: medicinesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<MedicineParams>(
      '/medicines/:medicine_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a medicine',
          description:
            "Undoes a medicine's delete. A live one is a 409 `record_not_deleted`; its name taken meanwhile a 409 `record_restore_conflict`. Requires medicine:delete.",
          tags: ['Medical store'],
          params: medicinesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
