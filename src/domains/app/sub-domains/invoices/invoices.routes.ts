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
  UpdateInvoiceDto,
  invoicesIdParamsDto,
  listInvoicesQueryDto,
} from './invoices.dto.js';

/** Registers the `invoices` routes (prefix `/api/v1/app`). */
export function invoicesRoutes(service: InvoicesService): FastifyPluginAsync {
  const controller = createInvoicesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/invoices',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.INVOICE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List invoices',
          description:
            "Returns one page of the active organization's invoices (newest first by default), with the total count; `q` searches, filters narrow. Requires invoice:read.",
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LIST_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export invoices',
          description:
            'Returns the invoices the same filters and sort as the list would (every page, up to 5,000 rows) as a CSV file inside the JSON envelope (`file_name`, `content_type`, `row_count`, `is_truncated`, `content`). Requires `list:export` ("Export lists") and invoice:read.',
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.INVOICE_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create invoice',
          description: 'Adds a invoice to the active organization. Requires invoice:create.',
          tags: ['Invoice'],
          body: CreateInvoiceDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { invoice_id: string } }>(
      '/invoices/:invoice_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.INVOICE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get invoice',
          description: 'Returns one invoice of the active organization. Requires invoice:read.',
          tags: ['Invoice'],
          params: invoicesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { invoice_id: string } }>(
      '/invoices/:invoice_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.INVOICE_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update invoice',
          description:
            "Changes any of a invoice's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires invoice:update.",
          tags: ['Invoice'],
          params: invoicesIdParamsDto,
          body: UpdateInvoiceDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { invoice_id: string } }>(
      '/invoices/:invoice_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.SALE_VOID)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete invoice',
          description:
            "Soft-deletes a invoice with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires sale:void.",
          tags: ['Invoice'],
          params: invoicesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { invoice_id: string } }>(
      '/invoices/:invoice_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.SALE_VOID)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore invoice',
          description: "Undoes a invoice's delete. A live invoice is a 409. Requires sale:void.",
          tags: ['Invoice'],
          params: invoicesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
