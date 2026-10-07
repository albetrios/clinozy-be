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
  UpdateMedicineDto,
  listMedicinesQueryDto,
  medicinesIdParamsDto,
} from './medicines.dto.js';

/** Registers the `medicines` routes (prefix `/api/v1/app`). */
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
          description:
            "Returns one page of the active organization's medicines (newest first by default), with the total count; `q` searches, filters narrow. Requires medicine:read.",
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LIST_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export medicines',
          description:
            'Returns the medicines the same filters and sort as the list would (every page, up to 5,000 rows) as a CSV file inside the JSON envelope (`file_name`, `content_type`, `row_count`, `is_truncated`, `content`). Requires `list:export` ("Export lists") and medicine:read.',
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
          summary: 'Create medicine',
          description: 'Adds a medicine to the active organization. Requires medicine:create.',
          tags: ['Medical store'],
          body: CreateMedicineDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { medicine_id: string } }>(
      '/medicines/:medicine_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get medicine',
          description: 'Returns one medicine of the active organization. Requires medicine:read.',
          tags: ['Medical store'],
          params: medicinesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { medicine_id: string } }>(
      '/medicines/:medicine_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update medicine',
          description:
            "Changes any of a medicine's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires medicine:update.",
          tags: ['Medical store'],
          params: medicinesIdParamsDto,
          body: UpdateMedicineDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { medicine_id: string } }>(
      '/medicines/:medicine_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete medicine',
          description:
            "Soft-deletes a medicine with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires medicine:delete.",
          tags: ['Medical store'],
          params: medicinesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { medicine_id: string } }>(
      '/medicines/:medicine_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore medicine',
          description:
            "Undoes a medicine's delete. A live medicine is a 409. Requires medicine:delete.",
          tags: ['Medical store'],
          params: medicinesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
