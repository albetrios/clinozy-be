import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { OffersService } from './offers.service.js';
import { createOffersController } from './offers.controller.js';
import {
  CreateOfferDto,
  UpdateOfferDto,
  listOffersQueryDto,
  offersIdParamsDto,
} from './offers.dto.js';

/** Registers the `offers` routes (prefix `/api/v1/app`). */
export function offersRoutes(service: OffersService): FastifyPluginAsync {
  const controller = createOffersController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/offers',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List offers',
          description:
            "Returns one page of the active organization's offers — by default in the order Live → Scheduled → Paused → Ended, newest first inside each (O10) — with the total count on the first page. `q` matches the name or code; filters `status`, `kind`, `offering_id`, `branch_id` (runs there — every-branch offers included, O5), `starts_on_from` / `starts_on_to`; `sort` = `status` | `created_at` | `name` | `starts_on` (offers without a start sort earliest). Requires organization:read (every member).",
          tags: ['Offering'],
          querystring: listOffersQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/offers',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create offer',
          description:
            'Adds a time-boxed offer: `value` by `kind` — `percent` a whole 1–100, `amount` / `fixed` rupees above 0, `extra` whole sessions 1–99; `code` A–Z / 0–9 up to 16, stored uppercase, unique among live offers (409); `offering_ids` 1–50 live, active offerings (O12); `branch_ids` empty = every branch; `ends_on` on or after `starts_on`. The response carries the derived `status`. Requires offering:create.',
          tags: ['Offering'],
          body: CreateOfferDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { offer_id: string } }>(
      '/offers/:offer_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get offer',
          description:
            'Returns one live offer of the active organization with its derived `status` (live · scheduled · paused · ended); a deleted one is a 404. Requires organization:read (every member).',
          tags: ['Offering'],
          params: offersIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { offer_id: string } }>(
      '/offers/:offer_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update offer',
          description:
            "Changes any of an offer's fields — `is_active` false pauses it, true resumes it; null clears an optional one. The row the save would leave is checked like a create (value for its kind, dates, active offerings, the code). Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` naming who changed it (D43). Requires offering:update.",
          tags: ['Offering'],
          params: offersIdParamsDto,
          body: UpdateOfferDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { offer_id: string } }>(
      '/offers/:offer_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete offer',
          description:
            "Soft-deletes an offer with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires offering:delete.",
          tags: ['Offering'],
          params: offersIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { offer_id: string } }>(
      '/offers/:offer_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore offer',
          description:
            "Undoes an offer's delete. A live offer is a 409 `record_not_deleted`; a code another live offer took meanwhile is a 409 `record_restore_conflict`. Requires offering:delete.",
          tags: ['Offering'],
          params: offersIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
