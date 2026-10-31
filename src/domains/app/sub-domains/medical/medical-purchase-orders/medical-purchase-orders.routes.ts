import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { MedicalPurchaseOrdersService } from './medical-purchase-orders.service.js';
import { createMedicalPurchaseOrdersController } from './medical-purchase-orders.controller.js';
import {
  CreateMedicalPurchaseOrderDto,
  ReceiveMedicalPurchaseOrderDto,
  UpdateMedicalPurchaseOrderDto,
  cancelMedicalPurchaseOrderQueryDto,
  listMedicalPurchaseOrdersQueryDto,
  medicalPurchaseGstSummaryQueryDto,
  medicalPurchaseOrdersIdParamsDto,
} from './medical-purchase-orders.dto.js';

/** The by-id routes' path params. */
type MedicalPurchaseOrderParams = { Params: { medical_purchase_order_id: string } };

/** What the list and its CSV say about the query. */
const LIST_QUERY_TEXT =
  "`q` searches the number (`#431`), the bill number and the supplier's name; filters `supplier_id`, `stage` (ordered, received) and `payment_status` (unpaid, partial, paid — several, comma-separated), `order_date_from` / `order_date_to` (inclusive), the created range; sort `order_date` (default, newest first), `purchase_order_number`, `total` or `created_at`.";

/** What the GST summary and its CSV say about the month and the groups. */
const GST_SUMMARY_TEXT =
  "`month*` (`YYYY-MM`, not after the organization's current month — a 400 `month`): the received lines of the live orders received that month (in the organization's time zone). `by_rate` — one row per GST rate present (ascending): `gst_percent`, `line_count`, `taxable_amount`, `gst_amount`, `total_amount`; `by_hsn` — one row per medicine HSN code and rate (`hsn_code` null for medicines without one, listed last); `totals` — the same sums and `order_count`. A month with nothing received answers empty lists and zero totals.";

/**
 * Registers the `medical-purchase-orders` routes (prefix `/api/v1/app`) — routes-final 11.E,
 * routes 25–32.
 */
export function medicalPurchaseOrdersRoutes(
  service: MedicalPurchaseOrdersService,
): FastifyPluginAsync {
  const controller = createMedicalPurchaseOrdersController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/medical-purchase-orders',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List medical purchase orders',
          description: `Returns one page of the store's orders — the Purchases tab — each with its supplier, lines (with their GST), \`stage\`, \`taxable_total\`, \`gst_total\`, \`total\`, what is paid and credited, \`due_amount\` and \`payment_status\`. ${LIST_QUERY_TEXT} Requires medicine:read.`,
          tags: ['Medical store'],
          querystring: listMedicalPurchaseOrdersQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get(
      '/medical-purchase-orders/exports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export medical purchase orders',
          description: `The orders CSV (\`medical-purchase-orders-YYYY-MM-DD.csv\`, up to 5,000 rows — \`is_truncated\` when more matched), with the list's filters and sort. ${LIST_QUERY_TEXT} Requires medicine:export and medicine:read.`,
          tags: ['Medical store'],
          querystring: listMedicalPurchaseOrdersQueryDto,
        },
      },
      controller.export,
    );
    zodApplication.get(
      '/medical-purchase-orders/gst-summary',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Summarize purchase GST for a month',
          description: `The purchase GST summary of one month — the purchase register's GST, for input tax credit. ${GST_SUMMARY_TEXT} Requires medicine:read.`,
          tags: ['Medical store'],
          querystring: medicalPurchaseGstSummaryQueryDto,
        },
      },
      controller.collectionView('gst-summary'),
    );
    zodApplication.get(
      '/medical-purchase-orders/gst-summary/exports',
      {
        onRequest: [app.authenticate],
        preHandler: [
          requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_EXPORT),
          requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ),
        ],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export the purchase GST summary',
          description: `The month's purchase GST summary as a CSV (\`purchase-gst-summary-YYYY-MM.csv\`, in the exports' envelope — \`file_name\`, \`content_type\`, \`row_count\`, \`is_truncated\` (always false), \`content\`): one row per group with its \`section\` (\`by_rate\`, \`by_hsn\`, \`total\`), \`gst_percent\`, \`hsn_code\`, \`line_count\`, \`taxable_amount\`, \`gst_amount\`, \`total_amount\`. ${GST_SUMMARY_TEXT} Requires medicine:export and medicine:read.`,
          tags: ['Medical store'],
          querystring: medicalPurchaseGstSummaryQueryDto,
        },
      },
      controller.collectionView('gst-summary-exports'),
    );
    zodApplication.post(
      '/medical-purchase-orders',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create a medical purchase order',
          description:
            "Orders from a supplier: `supplier_id*` (a live supplier), `items*` (1–50: a `medicine_id` — or `new_medicine_name`, a quick medicine at MRP 0 added as typed — `quantity*` 1–9999 packs, `free_quantity`, `rate*` (a pack's) above 0, `mrp` (printed on the packs, above 0), `gst_percent` (0, 5, 12, 18, 28 — the medicine's unless sent), `is_gst_inclusive` (the rate includes GST — true unless sent); a 400 `items` otherwise); optional `supplier_bill_number`, `note` (1–500 — \"30 DAYS DUE\"), `order_date` (today unless sent, never after it — a 400). Each line's `taxable_amount`, `gst_amount` and `amount` follow the invoice calculation, to the paisa (inclusive: the amount is quantity × rate, GST inside; exclusive: GST on top); the order's `taxable_total`, `gst_total` and `total` are its lines'. It stays `ordered` until received. Requires medicine:create.",
          tags: ['Medical store'],
          body: CreateMedicalPurchaseOrderDto,
        },
      },
      controller.create,
    );
    zodApplication.get<MedicalPurchaseOrderParams>(
      '/medical-purchase-orders/:medical_purchase_order_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a medical purchase order',
          description:
            'Returns one order with its lines (each with `gst_percent`, `is_gst_inclusive`, `taxable_amount`, `gst_amount`), its `taxable_total`, `gst_total` and `total`, and what is due. Requires medicine:read.',
          tags: ['Medical store'],
          params: medicalPurchaseOrdersIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<MedicalPurchaseOrderParams>(
      '/medical-purchase-orders/:medical_purchase_order_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a medical purchase order',
          description:
            'Changes an order not yet received — a received one is a 409 `transition_not_allowed`, unless the change sends only `note`: `supplier_id`, `supplier_bill_number`, `note` (null clears either), `order_date`, `items` (the whole list, checked as on create). Send `expected_updated_at` and a save over a newer change is a 409 `record_changed`. Requires medicine:update.',
          tags: ['Medical store'],
          params: medicalPurchaseOrdersIdParamsDto,
          body: UpdateMedicalPurchaseOrderDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<MedicalPurchaseOrderParams>(
      '/medical-purchase-orders/:medical_purchase_order_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Cancel a medical purchase order',
          description:
            "Cancels an order not yet received (a received one is a 409 `transition_not_allowed`), with why: `reason` (mistake, supplier_cant_deliver, price_changed, other) and a `note`, required for other. Undo with restore until the organization's purge window ends. Requires medicine:delete.",
          tags: ['Medical store'],
          params: medicalPurchaseOrdersIdParamsDto,
          querystring: cancelMedicalPurchaseOrderQueryDto,
        },
      },
      controller.remove,
    );
    zodApplication.post<MedicalPurchaseOrderParams>(
      '/medical-purchase-orders/:medical_purchase_order_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Undo a medical purchase order cancel',
          description:
            "Undoes an order's cancel — it is `ordered` again. A live one is a 409 `record_not_deleted`. Requires medicine:delete.",
          tags: ['Medical store'],
          params: medicalPurchaseOrdersIdParamsDto,
        },
      },
      controller.restore,
    );
    zodApplication.post<MedicalPurchaseOrderParams>(
      '/medical-purchase-orders/:medical_purchase_order_id/receive',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Receive a medical purchase order',
          description:
            "\"Receive goods\": each line is received unless `items` ticks it off (`id*`, `is_received`, `batch_number` — default `NEW-<order number>` — `expiry_month` `YYYY-MM`, default 24 months after the order date, `mrp` — the order line's unless sent). Goods that came but were not ordered are lines without `id` — the `medicine_id` (or `new_medicine_name`, a quick medicine added as typed), `quantity*`, `free_quantity`, `rate*`, `mrp`, `gst_percent`, `is_gst_inclusive`, `batch_number`, `expiry_month` — added to the order as received lines (the order holds at most 50; a 400 `items` otherwise). A received line adds `quantity + free_quantity` packs — as units, × the medicine's `units_per_pack` — to that batch of its medicine (a new one, or the same number — with another expiry a 409 `record_already_exists`) at this line's rate, puts the line's MRP on the batch when it has one (a sale charges it), and refreshes the supplier's price. The totals (`taxable_total`, `gst_total`, `total`) become the received lines' (none received — or a line not of this order — is a 400 `items`); `supplier_bill_number` and `note` may come with the goods; the supplier's open credits are applied. A received order is a 409 `transition_not_allowed`. Pay it through `POST /payments` (`medical_purchase_order_id`) or the supplier's payments route. Requires medicine:update.",
          tags: ['Medical store'],
          params: medicalPurchaseOrdersIdParamsDto,
          body: ReceiveMedicalPurchaseOrderDto,
        },
      },
      controller.transition('receive'),
    );
  };
}
