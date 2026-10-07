import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { MedicalSalesService } from './medical-sales.service.js';
import { createMedicalSalesController } from './medical-sales.controller.js';
import {
  CreateMedicalSaleDto,
  listMedicalSalesQueryDto,
  medicalSalesIdParamsDto,
} from './medical-sales.dto.js';

/** Registers the `medical-sales` routes (prefix `/api/v1/app`). */
export function medicalSalesRoutes(service: MedicalSalesService): FastifyPluginAsync {
  const controller = createMedicalSalesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/medical-sales',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_SALE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List medical sales',
          description:
            "Returns one page of the active organization's medical sales (newest first by default), with the total count; `q` searches, filters narrow. Requires medical_sale:read.",
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LIST_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export medical sales',
          description:
            'Returns the medical sales the same filters and sort as the list would (every page, up to 5,000 rows) as a CSV file inside the JSON envelope (`file_name`, `content_type`, `row_count`, `is_truncated`, `content`). Requires `list:export` ("Export lists") and medical_sale:read.',
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_SALE_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create medical sale',
          description:
            'Adds a medical sale to the active organization. Requires medical_sale:create.',
          tags: ['Medical store'],
          body: CreateMedicalSaleDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { medical_sale_id: string } }>(
      '/medical-sales/:medical_sale_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_SALE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get medical sale',
          description:
            'Returns one medical sale of the active organization. Requires medical_sale:read.',
          tags: ['Medical store'],
          params: medicalSalesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.post<{ Params: { medical_sale_id: string } }>(
      '/medical-sales/:medical_sale_id/void',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.SALE_VOID)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Void sale',
          description:
            'Voids a sale that is unpaid and has no returns. A medical sale whose status does not allow it is a 409. Requires sale:void.',
          tags: ['Medical store'],
          params: medicalSalesIdParamsDto,
        },
      },
      controller.transition('void'),
    );
    zodApplication.delete<{ Params: { medical_sale_id: string } }>(
      '/medical-sales/:medical_sale_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_SALE_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete medical sale',
          description:
            "Soft-deletes a medical sale with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires medical_sale:delete.",
          tags: ['Medical store'],
          params: medicalSalesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { medical_sale_id: string } }>(
      '/medical-sales/:medical_sale_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_SALE_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore medical sale',
          description:
            "Undoes a medical sale's delete. A live medical sale is a 409. Requires medical_sale:delete.",
          tags: ['Medical store'],
          params: medicalSalesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
