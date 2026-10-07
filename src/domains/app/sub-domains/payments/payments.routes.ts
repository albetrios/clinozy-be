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
  UpdatePaymentDto,
  listPaymentsQueryDto,
  paymentsIdParamsDto,
} from './payments.dto.js';

/** Registers the `payments` routes (prefix `/api/v1/app`). */
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
          description:
            "Returns one page of the active organization's payments (newest first by default), with the total count; `q` searches, filters narrow. Requires payment:read.",
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LIST_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export payments',
          description:
            'Returns the payments the same filters and sort as the list would (every page, up to 5,000 rows) as a CSV file inside the JSON envelope (`file_name`, `content_type`, `row_count`, `is_truncated`, `content`). Requires `list:export` ("Export lists") and payment:read.',
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
          summary: 'Create payment',
          description: 'Adds a payment to the active organization. Requires payment:create.',
          tags: ['Payment'],
          body: CreatePaymentDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { payment_id: string } }>(
      '/payments/:payment_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get payment',
          description: 'Returns one payment of the active organization. Requires payment:read.',
          tags: ['Payment'],
          params: paymentsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { payment_id: string } }>(
      '/payments/:payment_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update payment',
          description:
            "Changes any of a payment's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires payment:update.",
          tags: ['Payment'],
          params: paymentsIdParamsDto,
          body: UpdatePaymentDto,
        },
      },
      controller.update,
    );
    zodApplication.post<{ Params: { payment_id: string } }>(
      '/payments/:payment_id/checked',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.DAY_CLOSE_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Tick payment at day close',
          description:
            'Ticks an entry in the day-close review. A payment whose status does not allow it is a 409. Requires day_close:update.',
          tags: ['Payment'],
          params: paymentsIdParamsDto,
        },
      },
      controller.transition('checked'),
    );
    zodApplication.delete<{ Params: { payment_id: string } }>(
      '/payments/:payment_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete payment',
          description:
            "Soft-deletes a payment with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires payment:delete.",
          tags: ['Payment'],
          params: paymentsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { payment_id: string } }>(
      '/payments/:payment_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore payment',
          description:
            "Undoes a payment's delete. A live payment is a 409. Requires payment:delete.",
          tags: ['Payment'],
          params: paymentsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
