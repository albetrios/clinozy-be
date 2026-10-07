import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { MedicalPurchaseOrdersService } from './medical-purchase-orders.service.js';
import { createMedicalPurchaseOrdersController } from './medical-purchase-orders.controller.js';
import {
  CreateMedicalPurchaseOrderDto,
  UpdateMedicalPurchaseOrderDto,
  cancelMedicalPurchaseOrderDto,
  listMedicalPurchaseOrdersQueryDto,
  medicalPurchaseOrdersIdParamsDto,
} from './medical-purchase-orders.dto.js';

/** Registers the `medical-purchase-orders` routes (prefix `/api/v1/app`). */
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_PURCHASE_ORDER_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List purchase orders',
          description:
            "Returns one page of the active organization's purchase orders (newest first by default), with the total count; `q` searches, filters narrow. Requires medical_purchase_order:read.",
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LIST_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export purchase orders',
          description:
            'Returns the purchase orders the same filters and sort as the list would (every page, up to 5,000 rows) as a CSV file inside the JSON envelope (`file_name`, `content_type`, `row_count`, `is_truncated`, `content`). Requires `list:export` ("Export lists") and medical_purchase_order:read.',
          tags: ['Medical store'],
          querystring: listMedicalPurchaseOrdersQueryDto,
        },
      },
      controller.export,
    );
    zodApplication.post(
      '/medical-purchase-orders',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_PURCHASE_ORDER_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create purchase order',
          description:
            'Adds a purchase order to the active organization. Requires medical_purchase_order:create.',
          tags: ['Medical store'],
          body: CreateMedicalPurchaseOrderDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { medical_purchase_order_id: string } }>(
      '/medical-purchase-orders/:medical_purchase_order_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_PURCHASE_ORDER_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get purchase order',
          description:
            'Returns one purchase order of the active organization. Requires medical_purchase_order:read.',
          tags: ['Medical store'],
          params: medicalPurchaseOrdersIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { medical_purchase_order_id: string } }>(
      '/medical-purchase-orders/:medical_purchase_order_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_PURCHASE_ORDER_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update purchase order',
          description:
            "Changes any of a purchase order's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires medical_purchase_order:update.",
          tags: ['Medical store'],
          params: medicalPurchaseOrdersIdParamsDto,
          body: UpdateMedicalPurchaseOrderDto,
        },
      },
      controller.update,
    );
    zodApplication.post<{ Params: { medical_purchase_order_id: string } }>(
      '/medical-purchase-orders/:medical_purchase_order_id/receive',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_PURCHASE_ORDER_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Receive purchase order',
          description:
            'Marks the order received \u2014 its batches go into stock. A purchase order whose status does not allow it is a 409. Requires medical_purchase_order:update.',
          tags: ['Medical store'],
          params: medicalPurchaseOrdersIdParamsDto,
        },
      },
      controller.transition('receive'),
    );
    zodApplication.post<{ Params: { medical_purchase_order_id: string } }>(
      '/medical-purchase-orders/:medical_purchase_order_id/cancel',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_PURCHASE_ORDER_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Cancel purchase order',
          description:
            'Cancels an order not yet received, with a reason. A purchase order whose status does not allow it is a 409. Requires medical_purchase_order:update.',
          tags: ['Medical store'],
          params: medicalPurchaseOrdersIdParamsDto,
          body: cancelMedicalPurchaseOrderDto,
        },
      },
      controller.transition('cancel'),
    );
    zodApplication.delete<{ Params: { medical_purchase_order_id: string } }>(
      '/medical-purchase-orders/:medical_purchase_order_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_PURCHASE_ORDER_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete purchase order',
          description:
            "Soft-deletes a purchase order with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires medical_purchase_order:delete.",
          tags: ['Medical store'],
          params: medicalPurchaseOrdersIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { medical_purchase_order_id: string } }>(
      '/medical-purchase-orders/:medical_purchase_order_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_PURCHASE_ORDER_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore purchase order',
          description:
            "Undoes a purchase order's delete. A live purchase order is a 409. Requires medical_purchase_order:delete.",
          tags: ['Medical store'],
          params: medicalPurchaseOrdersIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
