import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PaymentsService } from './payments.service.js';
import { createPaymentsController } from './payments.controller.js';
import {
  CreatePaymentDto,
  ReversePaymentDto,
  UpdatePaymentDto,
  listPaymentEditsQueryDto,
  listPaymentsQueryDto,
  paymentsIdParamsDto,
} from './payments.dto.js';

/** The by-id routes' path params. */
type PaymentParams = { Params: { payment_id: string } };

/** What the ledger and its export say about their filters. */
const LIST_FILTERS =
  "`q` is the payee or the number (`PAY-12`); filters `direction`, `kind` (several, comma-separated), `mode` (several — has that split), `branch_id` (several), `contact_id`, `patient_id` (the patient file's contact), `invoice_id`, `pending_credit_id`, `expense_category` (several), `paid_date_from` / `paid_date_to` (the organization's days, inclusive), `is_settled` (its day is closed), the created range; sort `paid_at` (default, newest first), `created_at` or `amount`. Another branch's payments only with branch:read (B4).";

/**
 * Registers the `payments` routes (prefix `/api/v1/app`) — routes-final 8.C, routes 12–20.
 */
export function paymentsRoutes(service: PaymentsService): FastifyPluginAsync {
  const controller = createPaymentsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/payments',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List payments',
          description: `Returns one page of the ledger — the organization's money in and out — each with its \`splits\`, the \`contact\` and \`patient_id\`, what it points at, \`is_settled\`, \`reversed_by_payment_id\`, \`edit_count\` and \`last_edit\`. ${LIST_FILTERS} Requires payment:read.`,
          tags: ['Payment'],
          querystring: listPaymentsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get(
      '/payments/exports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export payments',
          description: `Returns the payments the same filters and sort as the ledger would, as a CSV (\`payments-YYYY-MM-DD.csv\`, up to 5,000 rows; \`is_truncated\` when there are more). ${LIST_FILTERS} Requires payment:export and payment:read.`,
          tags: ['Payment'],
          querystring: listPaymentsQueryDto,
        },
      },
      controller.export,
    );
    zodApplication.post(
      '/payments',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Receive or pay',
          description:
            "Records money in or out: `kind*` (`receipt` · `money_back` received; `expense` · `supplier_bill` paid — the kind fixes `direction`; refunds and reversals have their own routes), `branch_id*` (one of yours), `splits*` (1–3 of cash · UPI · card, each once and more than 0 — `amount` is their total; `credit` only through a pending credit, a 400 `splits`); optional `paid_at` (default now — its day at the branch must be open, a 409 `day_closed`), `contact_id` (required for a receipt — a 400), `invoice_id` (a receipt's — that invoice's contact, at most its due: a 400 `contact_id` / a 409 `more_than_due`), `payee_name` (required for an expense or a supplier bill), `expense_category` (required for an expense, only there), `reference` (≤ 60), `note` (≤ 280), `attachment_keys` (up to 5 confirmed uploads). A receipt without an invoice is an advance. The invoice's paid amount moves in the same transaction; a `system` entry joins the contact's activity. Requires payment:create.",
          tags: ['Payment'],
          body: CreatePaymentDto,
        },
      },
      controller.create,
    );
    zodApplication.get<PaymentParams>(
      '/payments/:payment_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a payment',
          description:
            "Returns one payment with its splits, contact, links, `is_settled`, reversal and edits. Another branch's without branch:read is a 404. Requires payment:read.",
          tags: ['Payment'],
          params: paymentsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<PaymentParams>(
      '/payments/:payment_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a payment',
          description:
            "Changes a payment on an open day — its day and the new `paid_at`'s must be open (a 409 `day_closed`): any of `splits`, `paid_at`, `contact_id`, `invoice_id`, `payee_name`, `expense_category`, `reference`, `note`, `attachment_keys`, checked as on create. A refund's, reversal's or pending credit's payment keeps its amount, its credit split, its contact and its invoice (a 400). The kind, direction and branch never change. The invoice's paid amount moves by the difference (a 409 `more_than_due`); the changed fields are recorded (`GET …/edits`, B20). Send `expected_updated_at` and a save over a newer change is a 409 `record_changed`. Requires payment:update.",
          tags: ['Payment'],
          params: paymentsIdParamsDto,
          body: UpdatePaymentDto,
        },
      },
      controller.update,
    );
    zodApplication.get<PaymentParams>(
      '/payments/:payment_id/edits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a payment's changes",
          description:
            "Returns one page of what each change to a payment changed, newest first: `changes` (`{ field: { from, to } }` — the changed fields only), `author_membership_id`, `created_at`. Another branch's payment without branch:read is a 404. Requires payment:read.",
          tags: ['Payment'],
          params: paymentsIdParamsDto,
          querystring: listPaymentEditsQueryDto,
        },
      },
      controller.edits,
    );
    zodApplication.post<PaymentParams>(
      '/payments/:payment_id/reverse',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Reverse a settled payment',
          description:
            "Undoes a payment on a closed day: `reason*` (1–280 — the reversal's note); optional `paid_at` (default now — the reversal's own day must be open, a 409 `day_closed`). Writes a `reversal` entry opposite to it, with its splits and links, and moves the invoice's paid amount and the pending credit's settled amount back. A payment whose day is still open is a 409 `day_open` (delete it instead); one reversed before, or a reversal, a 409 `already_reversed`. Answers with the reversal. Requires payment:delete.",
          tags: ['Payment'],
          params: paymentsIdParamsDto,
          body: ReversePaymentDto,
        },
      },
      controller.transition('reverse'),
    );
    zodApplication.delete<PaymentParams>(
      '/payments/:payment_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a payment',
          description:
            "Deletes a payment on an open day (a 409 `day_closed` — reverse a settled one), with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Its money comes off the invoice and the pending credit (a 409 `more_than_paid` when a refund already took it); a refund's credit note goes with it. Requires payment:delete.",
          tags: ['Payment'],
          params: paymentsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<PaymentParams>(
      '/payments/:payment_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a payment',
          description:
            "Undoes a payment's delete on an open day (a 409 `day_closed`); its money goes back on the invoice and the pending credit (a 409 `more_than_due` / `credit_closed`), a refund's credit note with it. A live payment is a 409 `record_not_deleted`. Requires payment:delete.",
          tags: ['Payment'],
          params: paymentsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
