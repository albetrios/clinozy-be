import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { listPaymentsQueryDto } from '@/domains/app/sub-domains/billing/payments/payments.dto.js';
import type { PaymentsService } from '@/domains/app/sub-domains/billing/payments/payments.service.js';
import type { MedicalSalesService } from './medical-sales.service.js';
import {
  createMedicalPaymentsController,
  createMedicalSalesController,
} from './medical-sales.controller.js';
import {
  CreateMedicalSaleDto,
  ReturnMedicalSaleDto,
  listMedicalSalesQueryDto,
  medicalSalesIdParamsDto,
  voidMedicalSaleQueryDto,
} from './medical-sales.dto.js';

/** The by-id routes' path params. */
type MedicalSaleParams = { Params: { medical_sale_id: string } };

/** What the list and its CSV say about the query. */
const LIST_QUERY_TEXT =
  "`q` searches the number (`S-983`), the buyer's name or phone and the medicines' names; filters `status` (unpaid, paid, returned, voided) and `branch_id` (several, comma-separated), `contact_id`, `medicine_id`, `patient_prescription_id`; sort `sold_at` (default, newest first), `sale_number` or `total`. Another branch's sales only with branch:read.";

/** Registers the `medical-sales` routes (prefix `/api/v1/app`) — routes-final 11.H, routes 44–51. */
export function medicalSalesRoutes(services: {
  medicalSalesService: MedicalSalesService;
  paymentsService: PaymentsService;
}): FastifyPluginAsync {
  const controller = createMedicalSalesController(services.medicalSalesService);
  const paymentsController = createMedicalPaymentsController(services.paymentsService);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/medical-sales',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List medical sales',
          description: `Returns one page of the store's sales — the Sales tab — each with its buyer, \`status\`, invoice, lines (one per batch drawn), returns and margin. ${LIST_QUERY_TEXT} Requires medicine:read.`,
          tags: ['Medical store'],
          querystring: listMedicalSalesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get(
      '/medical-sales/exports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export medical sales',
          description: `The sales CSV (\`medical-sales-YYYY-MM-DD.csv\`, up to 5,000 rows — \`is_truncated\` when more matched), with the list's filters and sort. ${LIST_QUERY_TEXT} Requires medicine:export and medicine:read.`,
          tags: ['Medical store'],
          querystring: listMedicalSalesQueryDto,
        },
      },
      controller.export,
    );
    zodApplication.post(
      '/medical-sales',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create a medical sale',
          description:
            '"Create medical invoice": `branch_id*` (one of yours), `contact_id*` (the buyer — a patient\'s, a lead\'s or anyone\'s), `items*` (1–50: `medicine_id*` — each once, a live medicine — `quantity*`, `discount_percent`, the medicine\'s near-expiry discount unless sent); optional `overall_discount`, `member_ids` ("Prescribed by", up to 10 active members), `patient_prescription_id` (an approved prescription of the buyer\'s patient file — a 400 otherwise; one a live sale already fills is a 409 `prescription_filled`), `remark`, `payment` ("Paid now": `splits*`, `paid_at` — needs payment:create, a 403 otherwise; on a closed day a 409 `day_closed`). Each medicine is taken from its unexpired batches, earliest expiry first — too little is a 409 `not_enough_stock` — and the `medical` invoice is written with one line per batch, at the MRP with GST inside. A sale is never edited. Requires medicine:create.',
          tags: ['Medical store'],
          body: CreateMedicalSaleDto,
        },
      },
      controller.create,
    );
    zodApplication.get<MedicalSaleParams>(
      '/medical-sales/:medical_sale_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a medical sale',
          description:
            "Returns one sale — the Sale drawer — with its invoice, lines, returns and margin. Another branch's is a 404 without branch:read. Requires medicine:read.",
          tags: ['Medical store'],
          params: medicalSalesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.delete<MedicalSaleParams>(
      '/medical-sales/:medical_sale_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Void a medical sale',
          description:
            "Voids a sale with nothing paid and nothing returned — something paid (or credited) is a 409 `sale_has_payments`, a return a 409 `sale_has_returns` — with why: `reason` (billed_by_mistake, wrong_items, customer_changed_mind, other) and a `note`, required for other. Each line goes back into its batch and the invoice is deleted. Undo with restore until the organization's purge window ends. Requires medicine:delete.",
          tags: ['Medical store'],
          params: medicalSalesIdParamsDto,
          querystring: voidMedicalSaleQueryDto,
        },
      },
      controller.remove,
    );
    zodApplication.post<MedicalSaleParams>(
      '/medical-sales/:medical_sale_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Undo a medical sale void',
          description:
            'Undoes a void: the lines are taken again from the same batches (no longer there is a 409 `not_enough_stock`) and the invoice comes back. A live one is a 409 `record_not_deleted`; its prescription filled meanwhile a 409 `prescription_filled`. Requires medicine:delete.',
          tags: ['Medical store'],
          params: medicalSalesIdParamsDto,
        },
      },
      controller.restore,
    );
    zodApplication.post<MedicalSaleParams>(
      '/medical-sales/:medical_sale_id/returns',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Return from patient',
          description:
            "On a sale paid in full (money still due is a 409 `sale_not_paid`): `items*` (1–50: `invoice_item_id*`, `quantity*` up to what is left of the line — a 400 `items` otherwise), `reason*` (unused, reaction, doctor_changed, wrong_item, damaged), `refund_mode*` (cash, upi, card); optional `note`. The refund is the returned lines' share of their amounts — a credit note on the invoice with its refund payment on the sale's branch, today (a closed day is a 409 `day_closed`). Unused, doctor_changed and wrong_item packs go back into their batch; reaction and damaged are written off. Answers with the sale. Requires payment:create.",
          tags: ['Medical store'],
          params: medicalSalesIdParamsDto,
          body: ReturnMedicalSaleDto,
        },
      },
      controller.transition('returns'),
    );
    zodApplication.get(
      '/medical-payments',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List the medical store's payments",
          description:
            "The store's Payments tab: the payments ledger limited to the medical store — receipts and refunds on `medical` invoices, supplier bills of medical orders and `medicines` expenses (and their reversals) — with the ledger's filters (`q`, `direction`, `kind`, `mode`, `branch_id`, the paid days, `is_settled`, …) and sorts. Another branch's payments only with branch:read. Requires medicine:read.",
          tags: ['Medical store'],
          querystring: listPaymentsQueryDto,
        },
      },
      paymentsController.list,
    );
  };
}
