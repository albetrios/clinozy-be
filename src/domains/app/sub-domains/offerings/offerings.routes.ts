import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { OfferingsService } from './offerings.service.js';
import { createOfferingsController } from './offerings.controller.js';
import {
  CreateOfferingDto,
  UpdateOfferingDto,
  listOfferingsQueryDto,
  offeringsIdParamsDto,
} from './offerings.dto.js';

/** Registers the `offerings` routes (prefix `/api/v1/app`). */
export function offeringsRoutes(service: OfferingsService): FastifyPluginAsync {
  const controller = createOfferingsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/offerings',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List offerings',
          description:
            "Returns one page of the active organization's offerings (newest first by default), with the total count on the first page. `q` matches the name, the number (`274`, `#274`) or a search term; filters `category`, `specialty`, `is_active`, `offering_group_id`, and `branch_id` (offered there — every-branch offerings included, O5). `min_price` is null without offering:lower_price:read. Requires organization:read (every member).",
          tags: ['Offering'],
          querystring: listOfferingsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get(
      '/offerings/exports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export offerings',
          description:
            'Returns the offerings the same filters and sort as the list would (every page, up to 5,000 rows; `limit` and `after` ignored) as a CSV file inside the JSON envelope (`file_name` `offerings-YYYY-MM-DD.csv`, `content_type`, `row_count`, `is_truncated`, `content` — the offering fields as columns, lists joined with `|`). Requires offering:export (O14).',
          tags: ['Offering'],
          querystring: listOfferingsQueryDto,
        },
      },
      controller.export,
    );
    zodApplication.post(
      '/offerings',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create offering',
          description:
            'Adds an offering to the active organization with its prices: `min_price` ≤ `offer_price` ≤ `price` (a 400 naming the field otherwise, O4); GST defaults to 0 for a consultation, else 18; `branch_ids` empty = every branch. `min_price` needs offering:lower_price:read too — sent without it, a 403 `field_permission_required`. A name another offering has (any case) is a 409 `offering_name_taken`. Requires offering:create.',
          tags: ['Offering'],
          body: CreateOfferingDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { offering_id: string } }>(
      '/offerings/:offering_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get offering',
          description:
            'Returns one live offering of the active organization; a deleted one is a 404. `min_price` is null without offering:lower_price:read. Requires organization:read (every member).',
          tags: ['Offering'],
          params: offeringsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { offering_id: string } }>(
      '/offerings/:offering_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update offering',
          description:
            "Changes any of an offering's fields, prices included; null clears an optional one, `branch_ids` replaces the set (`[]` = every branch). The prices the save would leave must keep `min_price` ≤ `offer_price` ≤ `price` (O4); `min_price` needs offering:lower_price:read too — sent without it, a 403 `field_permission_required`. A name another offering has (any case) is a 409 `offering_name_taken`. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` naming who changed it (D43). Requires offering:update.",
          tags: ['Offering'],
          params: offeringsIdParamsDto,
          body: UpdateOfferingDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { offering_id: string } }>(
      '/offerings/:offering_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete offering',
          description:
            "Soft-deletes an offering with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. It leaves new bookings and bills; past records keep it. Restorable until the organization's purge window ends (D38). Requires offering:delete.",
          tags: ['Offering'],
          params: offeringsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { offering_id: string } }>(
      '/offerings/:offering_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore offering',
          description:
            "Undoes an offering's delete. A live offering is a 409 `record_not_deleted`; a name taken meanwhile is a 409 `record_restore_conflict`. Requires offering:delete.",
          tags: ['Offering'],
          params: offeringsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
