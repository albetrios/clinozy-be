import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { InvoiceCreditNotesService } from './invoice-credit-notes.service.js';
import { createInvoiceCreditNotesController } from './invoice-credit-notes.controller.js';
import {
  CreateInvoiceCreditNoteDto,
  invoiceCreditNotesIdParamsDto,
  invoiceCreditNotesParentParamsDto,
  listInvoiceCreditNotesNestedQueryDto,
  listInvoiceCreditNotesQueryDto,
} from './invoice-credit-notes.dto.js';

/** The nested routes' parent path param. */
type InvoiceParams = { Params: { invoice_id: string } };

/** The by-id route's path params. */
type CreditNoteParams = { Params: { invoice_id: string; invoice_credit_note_id: string } };

/**
 * Registers the credit-note routes (prefix `/api/v1/app`) — routes-final 8.B, routes 8–11: the
 * organization-wide list, and the credit notes nested under their invoice.
 */
export function invoiceCreditNotesRoutes(service: InvoiceCreditNotesService): FastifyPluginAsync {
  const controller = createInvoiceCreditNotesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/invoice-credit-notes',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List credit notes',
          description:
            "Returns one page of the organization's credit notes (newest first), each with its invoice and `payment_id` (its refund). `q` is the number (`CN-12`); filters `invoice_id`, `contact_id` (the invoice's), `branch_id` (the invoice's — several, comma-separated), the created range. Only the caller's branches' without branch:read (B4). Requires payment:read.",
          tags: ['Invoice'],
          querystring: listInvoiceCreditNotesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get<InvoiceParams>(
      '/invoices/:invoice_id/credit-notes',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List an invoice's credit notes",
          description:
            "Returns one page of an invoice's credit notes (newest first), each with `payment_id` (its refund). Another branch's invoice is a 404 without branch:read (B4). Requires payment:read.",
          tags: ['Invoice'],
          params: invoiceCreditNotesParentParamsDto,
          querystring: listInvoiceCreditNotesNestedQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<InvoiceParams>(
      '/invoices/:invoice_id/credit-notes',
      {
        onRequest: [app.authenticate],
        // A refund gives money back — Owner, Admin and Accountant (D25, D83 (1)).
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Refund with a credit note',
          description:
            "Refunds money on an invoice: `amount*` (more than 0, up to what the invoice has paid — a 409 `more_than_paid`), `reason*` (1–280), `splits*` (how the money goes back — cash · UPI · card, each once, adding up to `amount`); optional `paid_at` (default now — its day at the invoice's branch must be open, a 409 `day_closed`), `reference` (≤ 60), `note` (≤ 280). Writes the credit note (`CN-001`) and its `refund` payment on the invoice's branch and contact in one transaction, lowers the invoice's paid amount and adds a `system` entry to the contact's activity (B16). Never edited — deleting its refund payment on an open day removes it too. Requires payment:delete — a refund gives money back, so it is the Owner's, the Admin's and the Accountant's (D25, D83); taking payments stays payment:create.",
          tags: ['Invoice'],
          params: invoiceCreditNotesParentParamsDto,
          body: CreateInvoiceCreditNoteDto,
        },
      },
      controller.create,
    );
    zodApplication.get<CreditNoteParams>(
      '/invoices/:invoice_id/credit-notes/:invoice_credit_note_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a credit note',
          description:
            "Returns one of an invoice's credit notes with `payment_id` (its refund). Another branch's invoice is a 404 without branch:read (B4). Requires payment:read.",
          tags: ['Invoice'],
          params: invoiceCreditNotesIdParamsDto,
        },
      },
      controller.get,
    );
  };
}
