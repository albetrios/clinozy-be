import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { InvoicesService } from './invoices.service.js';
import { createInvoicesController } from './invoices.controller.js';
import {
  CreateInvoiceDto,
  PreviewInvoiceChangeDto,
  PreviewInvoiceDto,
  UpdateInvoiceDto,
  invoicesIdParamsDto,
  listInvoicesQueryDto,
} from './invoices.dto.js';

/** The by-id routes' path params. */
type InvoiceParams = { Params: { invoice_id: string } };

/** What the list and export say about their filters. */
const LIST_FILTERS =
  "`q` is `#1042` (the sequence), the statutory number (`2026-27/0412`) or the billed contact (a name, phone or contact number); filters `type` and `branch_id` (several, comma-separated), `contact_id`, `patient_id` (the patient file's contact), `member_id` (credited), `payment_status` (several — `paid` · `partial` · `unpaid`), `invoice_date_from` / `invoice_date_to` (inclusive), the created range; sort `invoice_date` (default, newest first), `created_at` or `due_amount`. Another branch's invoices only with branch:read (B4).";

/**
 * Registers the `invoices` routes (prefix `/api/v1/app`) — routes-final 8.A, routes 1–7, and the
 * two previews (D81, Q2).
 */
export function invoicesRoutes(service: InvoicesService): FastifyPluginAsync {
  const controller = createInvoicesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/invoices',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List invoices',
          description: `Returns one page of the organization's invoices, each with its lines, the billed \`contact\` and \`patient_id\`, the server's amounts, \`paid_amount\`, \`due_amount\`, \`payment_status\`, \`is_settled\` (a payment on a closed day) and \`created_by_membership_id\` (who billed it). \`meta.due_total\` and \`meta.paid_total\` sum what is due and paid over every invoice the filters match (every page). ${LIST_FILTERS} Requires payment:read.`,
          tags: ['Invoice'],
          querystring: listInvoicesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get(
      '/invoices/exports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export invoices',
          description: `Returns the invoices the same filters and sort as the list would, as a CSV (\`invoices-YYYY-MM-DD.csv\`, up to 5,000 rows; \`is_truncated\` when there are more). ${LIST_FILTERS} Requires payment:export and payment:read.`,
          tags: ['Invoice'],
          querystring: listInvoicesQueryDto,
        },
      },
      controller.export,
    );
    zodApplication.post(
      '/invoices',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Bill',
          description:
            "Bills a contact: `branch_id*` (one of yours), `items*` (1–50 — each an `offering_id` (clinic, consultation — a consultation invoice takes consultation offerings only; active and offered at the branch, O13, O5) or a `medicine_id` (medical), `quantity*` (1–999), `discount_percent` (0–100, 2 decimals), `patient_offering_suggestion_id` (the plan row it invoices — the patient's live planned or accepted row for the offering when none is sent, PK7), `patient_treatment_ids` (the patient's done, unbilled treatments of the offering it pays for, up to its sessions, B28)), `contact_id` (required except `medical`; a clinic or consultation bill's contact needs a patient file — a 400 `patient_file_required`), `type` (`clinic` default · `consultation` · `medical`), `invoice_date` (default today), `member_ids` (≤ 10 — who is credited), `overall_discount` (an amount, at most what the lines come to — a 400), `remark` (≤ 500), `patient_prescription_id`, and `payment` — the drawer's \"Paid now\" (`splits*` cash · UPI · card, optional `paid_at` on an open day, `reference`), up to the total (a 409 `more_than_due`). The server sets each line's rate and GST and computes every amount (B9): an offering line bills the best live offer on the invoice date at the branch — the lowest of its percent, amount-off and fixed-price offers on the offer price (or the list price), never below the lowest price — and a session line adds the most free sessions a live extra-sessions offer gives (M26, routes-final §3.10); a medicine line bills its MRP. A line under the offering's lowest price is a 400 `below_lowest_price` naming the line (`errors[].field` `items/<n>`, its place in `items`, B10). A `treatment`, `package` or `lhr` line creates the patient offering (PK4), a plan row it invoices turns `accepted`, the treatments it names are billed (a 409 `treatment_billed` when billed meanwhile). The numbers come from the server (#1042, 2026-27/0412). A `system` entry joins the contact's activity. Requires payment:create.",
          tags: ['Invoice'],
          body: CreateInvoiceDto,
        },
      },
      controller.create,
    );
    zodApplication.post(
      '/invoices/preview',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_CREATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Preview a bill',
          description:
            "Answers what `POST /app/invoices` would write for the same body without `payment` — the lines (each with its server `rate`, GST and amounts, `sessions_total` and the live `offer_ids` it applies) and the totals (`subtotal`, `discount_total`, `taxable_total`, `gst_total`, `total`, `due_amount`), with the `type` and `invoice_date` it would default to — and writes nothing (D81, Q2). The bill's refusals apply (a branch not yours, a reference not here, a line rule, a 400 `below_lowest_price` on `items/<n>`); `contact_id` may wait until the patient is picked — once sent, a clinic or consultation bill's contact needs a patient file (a 400 `patient_file_required`). Nothing is written, so `X-Idempotency-Key` is optional. Requires payment:create.",
          tags: ['Invoice'],
          body: PreviewInvoiceDto,
        },
      },
      controller.preview,
    );
    zodApplication.get<InvoiceParams>(
      '/invoices/:invoice_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get an invoice',
          description:
            "Returns one invoice — the print preview: its lines (what each sold and bills), the amounts, what is paid and due. Another branch's without branch:read is a 404. Requires payment:read.",
          tags: ['Invoice'],
          params: invoicesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<InvoiceParams>(
      '/invoices/:invoice_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change an invoice',
          description:
            "Changes an invoice until it is settled — a payment on a closed day is a 409 `invoice_settled` (then a credit note). Any of `contact_id` (only while nothing is paid — a 400), `invoice_date` (in the same financial year — a 400), `items` (kept by `id`: sent with an `id` = changed, without = added, left out = removed; a line whose patient offering has a spent session can't be removed or change its offering or quantity — a 409 `offering_in_use`; `patient_treatment_ids` adds billed treatments), `member_ids`, `overall_discount`, `remark`, `patient_prescription_id`. The branch and type never change (a 400). A new total under what is paid is a 409 `below_paid`. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` (D43). Requires payment:update.",
          tags: ['Invoice'],
          params: invoicesIdParamsDto,
          body: UpdateInvoiceDto,
        },
      },
      controller.update,
    );
    zodApplication.post<InvoiceParams>(
      '/invoices/:invoice_id/preview',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Preview a change to an invoice',
          description:
            "Answers what `PATCH /app/invoices/{invoice_id}` would write for the same fields (all optional; none = the stored lines as they are; no `expected_updated_at`) — the lines (a kept line keeps its `id` and its rate; a new or changed one bills the best live offer, M26), the totals, `paid_amount` (what is already paid) and `due_amount` — and writes nothing (D81). The change's refusals apply: a 409 `invoice_settled`, `invoice_of_sale`, `below_paid` or `offering_in_use`, a 400 `below_lowest_price` on `items/<n>`. Another branch's invoice without branch:read is a 404. Nothing is written, so `X-Idempotency-Key` is optional. Requires payment:update.",
          tags: ['Invoice'],
          params: invoicesIdParamsDto,
          body: PreviewInvoiceChangeDto,
        },
      },
      controller.previewChange,
    );
    zodApplication.delete<InvoiceParams>(
      '/invoices/:invoice_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete an unpaid invoice',
          description:
            'Deletes an invoice with nothing paid and no credit note (a 409 `invoice_paid`) and no patient offering with a spent session (a 409 `offering_in_use`), with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Its patient offerings go and come back with it; its plan rows count as not invoiced while it is deleted (B14). Requires payment:delete.',
          tags: ['Invoice'],
          params: invoicesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<InvoiceParams>(
      '/invoices/:invoice_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore an invoice',
          description:
            "Undoes an invoice's delete, its patient offerings with it. A live invoice is a 409 `record_not_deleted`. Requires payment:delete.",
          tags: ['Invoice'],
          params: invoicesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
