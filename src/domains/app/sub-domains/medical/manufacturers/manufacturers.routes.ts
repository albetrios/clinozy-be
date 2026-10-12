import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { ManufacturersService } from './manufacturers.service.js';
import { createManufacturersController } from './manufacturers.controller.js';
import {
  CreateManufacturerDto,
  UpdateManufacturerDto,
  listManufacturersQueryDto,
  manufacturersIdParamsDto,
} from './manufacturers.dto.js';

/** The by-id routes' path params. */
type ManufacturerParams = { Params: { manufacturer_id: string } };

/** Registers the `manufacturers` routes (prefix `/api/v1/app`) — routes-final 11.A, routes 1–6. */
export function manufacturersRoutes(service: ManufacturersService): FastifyPluginAsync {
  const controller = createManufacturersController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/manufacturers',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List manufacturers',
          description:
            "Returns one page of the medical store's manufacturers — the Manufacturers tab and the picker — each with `medicine_count` and its suppliers and MRs. `q` searches the name; `supplier_id` and `medical_rep_id` narrow; sort `name` (default, A–Z) or `created_at`. Requires medicine:read.",
          tags: ['Medical store'],
          querystring: listManufacturersQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/manufacturers',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a manufacturer',
          description:
            "Adds a brand: `name*` (1–80, stored upper case, unique in any case — a 409 `record_already_exists`); optional `tone` (lav, sky, butter, blush, sage, mint), `is_quick` (a picker's inline add — it takes the tone after the last one added), `supplier_ids` and `medical_rep_ids` (up to 50 each, live records — a 400 otherwise), which link them on both sides. Requires medicine:create.",
          tags: ['Medical store'],
          body: CreateManufacturerDto,
        },
      },
      controller.create,
    );
    zodApplication.get<ManufacturerParams>(
      '/manufacturers/:manufacturer_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a manufacturer',
          description:
            'Returns one manufacturer with its medicine count, suppliers and MRs. Requires medicine:read.',
          tags: ['Medical store'],
          params: manufacturersIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<ManufacturerParams>(
      '/manufacturers/:manufacturer_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a manufacturer',
          description:
            "Changes a manufacturer's `name` (upper case, unique — a 409 `record_already_exists`), `tone`, `supplier_ids` or `medical_rep_ids` (each list replaces its links). Send `expected_updated_at` and a save over a newer change is a 409 `record_changed`. Requires medicine:update.",
          tags: ['Medical store'],
          params: manufacturersIdParamsDto,
          body: UpdateManufacturerDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<ManufacturerParams>(
      '/manufacturers/:manufacturer_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a manufacturer',
          description:
            "Deletes a manufacturer no live medicine names (a 409 `manufacturer_has_medicines` otherwise), with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends. Requires medicine:delete.",
          tags: ['Medical store'],
          params: manufacturersIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<ManufacturerParams>(
      '/manufacturers/:manufacturer_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICINE_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a manufacturer',
          description:
            "Undoes a manufacturer's delete. A live one is a 409 `record_not_deleted`; its name taken meanwhile a 409 `record_restore_conflict`. Requires medicine:delete.",
          tags: ['Medical store'],
          params: manufacturersIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
