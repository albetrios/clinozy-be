import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { OfferingGroupsService } from './offering-groups.service.js';
import { createOfferingGroupsController } from './offering-groups.controller.js';
import {
  CreateOfferingGroupDto,
  UpdateOfferingGroupDto,
  listOfferingGroupsQueryDto,
  offeringGroupsIdParamsDto,
} from './offering-groups.dto.js';

/** Registers the `offering-groups` routes (prefix `/api/v1/app`). */
export function offeringGroupsRoutes(service: OfferingGroupsService): FastifyPluginAsync {
  const controller = createOfferingGroupsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/offering-groups',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List offering groups',
          description:
            "Returns one page of the active organization's offering groups in menu order by default (`sort_order`, then name — O8), with the total count on the first page; `q` searches the name; `sort` = `sort_order` | `name` | `created_at`. Requires organization:read (every member).",
          tags: ['Offering'],
          querystring: listOfferingGroupsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/offering-groups',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create offering group',
          description:
            'Adds an offering group (a menu section) to the active organization: `name` (1–60, unique in the organization in any case — 409 otherwise) and `sort_order` (0–9999, default 0). Requires offering:create.',
          tags: ['Offering'],
          body: CreateOfferingGroupDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { offering_group_id: string } }>(
      '/offering-groups/:offering_group_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get offering group',
          description:
            'Returns one live offering group of the active organization; a deleted one is a 404. Requires organization:read (every member).',
          tags: ['Offering'],
          params: offeringGroupsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { offering_group_id: string } }>(
      '/offering-groups/:offering_group_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update offering group',
          description:
            'Renames or reorders an offering group (`name`, `sort_order`); a name another group has is a 409. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` naming who changed it (D43). Requires offering:update.',
          tags: ['Offering'],
          params: offeringGroupsIdParamsDto,
          body: UpdateOfferingGroupDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { offering_group_id: string } }>(
      '/offering-groups/:offering_group_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete offering group',
          description:
            "Soft-deletes an empty offering group with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. A group live offerings still use is a 409 — move or ungroup them first (O7). Restorable until the organization's purge window ends (D38). Requires offering:delete.",
          tags: ['Offering'],
          params: offeringGroupsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { offering_group_id: string } }>(
      '/offering-groups/:offering_group_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore offering group',
          description:
            "Undoes an offering group's delete. A live group is a 409 `record_not_deleted`; a name taken meanwhile is a 409 `record_restore_conflict`. Requires offering:delete.",
          tags: ['Offering'],
          params: offeringGroupsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
