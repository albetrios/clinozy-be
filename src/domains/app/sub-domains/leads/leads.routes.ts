import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { LeadsService } from './leads.service.js';
import { createLeadsController } from './leads.controller.js';
import {
  CreateLeadDto,
  UpdateLeadDto,
  convertLeadDto,
  leadsIdParamsDto,
  listLeadsQueryDto,
} from './leads.dto.js';

/** Registers the `leads` routes (prefix `/api/v1/app`). */
export function leadsRoutes(service: LeadsService): FastifyPluginAsync {
  const controller = createLeadsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/leads',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List leads',
          description:
            "Returns one page of the active organization's leads (newest first by default), with the total count; `q` searches, filters narrow. Requires lead:read.",
          tags: ['Lead'],
          querystring: listLeadsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get(
      '/leads/exports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LIST_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export leads',
          description:
            'Returns the leads the same filters and sort as the list would (every page, up to 5,000 rows) as a CSV file inside the JSON envelope (`file_name`, `content_type`, `row_count`, `is_truncated`, `content`). Requires `list:export` ("Export lists") and lead:read.',
          tags: ['Lead'],
          querystring: listLeadsQueryDto,
        },
      },
      controller.export,
    );
    zodApplication.post(
      '/leads',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create lead',
          description: 'Adds a lead to the active organization. Requires lead:create.',
          tags: ['Lead'],
          body: CreateLeadDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { lead_id: string } }>(
      '/leads/:lead_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get lead',
          description: 'Returns one lead of the active organization. Requires lead:read.',
          tags: ['Lead'],
          params: leadsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { lead_id: string } }>(
      '/leads/:lead_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update lead',
          description:
            "Changes any of a lead's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires lead:update.",
          tags: ['Lead'],
          params: leadsIdParamsDto,
          body: UpdateLeadDto,
        },
      },
      controller.update,
    );
    zodApplication.post<{ Params: { lead_id: string } }>(
      '/leads/:lead_id/claim',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Claim lead',
          description:
            "Takes the lead: the caller becomes its owner and holds it for the organization's `lead_hold_days` (D40). A lead someone else still holds is a 409 `lead_held`. A lead whose status does not allow it is a 409. Requires lead:update.",
          tags: ['Lead'],
          params: leadsIdParamsDto,
        },
      },
      controller.transition('claim'),
    );
    zodApplication.post<{ Params: { lead_id: string } }>(
      '/leads/:lead_id/release',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Release lead',
          description:
            'Gives the lead back to the team \u2014 no owner, no hold. Only its owner releases it (403 otherwise; an admin reassigns with PATCH). A lead whose status does not allow it is a 409. Requires lead:update.',
          tags: ['Lead'],
          params: leadsIdParamsDto,
        },
      },
      controller.transition('release'),
    );
    zodApplication.post<{ Params: { lead_id: string } }>(
      '/leads/:lead_id/convert',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Convert lead to patient',
          description:
            "Creates the patient from the lead (name, mobile, email, branch \u2014 the body overrides) and links both ways; the lead's conversation moves to the patient (patients.3). A lead already converted is a 409 `lead_converted`. A lead whose status does not allow it is a 409. Requires patient:create.",
          tags: ['Lead'],
          params: leadsIdParamsDto,
          body: convertLeadDto,
        },
      },
      controller.transition('convert'),
    );
    zodApplication.post<{ Params: { lead_id: string } }>(
      '/leads/:lead_id/reads',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_READ)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Mark lead read',
          description:
            'Records that the caller has read the conversation up to now (`app.lead_reads`, per viewer) \u2014 `is_unread` turns false for them until the next line. A lead whose status does not allow it is a 409. Requires lead:read.',
          tags: ['Lead'],
          params: leadsIdParamsDto,
        },
      },
      controller.transition('reads'),
    );
    zodApplication.delete<{ Params: { lead_id: string } }>(
      '/leads/:lead_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete lead',
          description:
            "Soft-deletes a lead with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires lead:delete.",
          tags: ['Lead'],
          params: leadsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { lead_id: string } }>(
      '/leads/:lead_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore lead',
          description: "Undoes a lead's delete. A live lead is a 409. Requires lead:delete.",
          tags: ['Lead'],
          params: leadsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
