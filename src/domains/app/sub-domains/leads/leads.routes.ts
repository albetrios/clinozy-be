import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { LeadsService } from './leads.service.js';
import { createLeadsController } from './leads.controller.js';
import { CreateLeadDto, UpdateLeadDto, leadsIdParamsDto, listLeadsQueryDto } from './leads.dto.js';

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
            'Returns one page of the active organization\'s leads, each with its contact\'s summary (`contact`), `last_activity_at` and `is_awaiting_reply` (L1, M3). `q` searches the contact\'s names, numbers and contact number (`C-12345`) — every word of it, in any order — and the lead number (`#2371`) — text needs 3+ characters, a number 4+ digits (a 400 otherwise). Filters: `status`, `source`, `interests` (comma-separated — any of), `kind`, `contact_id`, `owner_membership_id` ("Mine"), `team_membership_id` (owner or involved), `is_awaiting_reply` ("Unreplied" = mine + awaiting reply), `ownership` (`open` · `held` · `releasing_today`), `branch_id` (one) or `branch_ids` (several, comma-separated — the list form of the branch filter here; Tasks and Payments take a list in `branch_id`), the follow-up and created ranges. Sort `created_at` (default, newest first), `name`, `status`, `source`, `follow_up_at` or `last_activity_at` — rows without a value come last (L7). A caller without `branch:read` sees their branches\' leads and leads with no branch. Requires lead:read.',
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export leads',
          description:
            'Returns the leads the same filters and sort as the list would (every page, up to 5,000 rows; `limit` and `after` ignored) as a CSV file inside the JSON envelope (`file_name` `leads-YYYY-MM-DD.csv`, `content_type`, `row_count`, `is_truncated`, `content` — the lead fields as columns, the contact summary as JSON, lists joined with `|`). Requires lead:export (L4) and lead:read.',
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
          description:
            'Adds a lead for a contact: `contact_id`, or `contact` — a new contact (the contact create body) written in the same transaction (L1; needs contact:create too — a 403 otherwise). Exactly one of them (a 400 on `contact_id`). The contact may have one open lead (`new`, `contacted`, `follow_up`, `no_response`): another is a 409 `lead_open_exists` naming it (L6); an inline number on another household is a 409 `contact_phone_exists`. `clinic_visited` is set by check-in only (a 409 `lead_closed`, L8). An owner starts holding it for `lead_hold_days` (D40); the owner and involved members handle the contact (CT11). `branch_id` must be one of yours unless you hold branch:read. Requires lead:create.',
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
          description:
            'Returns one lead with its contact summary, `patient_id` (the patient file check-in opened, L8), `last_activity_at` and `is_awaiting_reply`. A lead in a branch you cannot see is a 404. Requires lead:read.',
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
            "Changes any of a lead's fields (at least one); null clears an optional one; `involved_membership_ids` replaces the set (the owner is never also involved — a 400 when both name them). A new owner starts holding it for `lead_hold_days` and the one replaced stays involved (L9); no owner, no hold. `clinic_visited` is set by check-in only and is final — setting it, or changing the status of a lead in it, is a 409 `lead_closed` (its other fields stay editable, L8). Reopening a closed lead while the contact has another open one is a 409 `lead_open_exists` (L6). Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` (D43). Requires lead:update.",
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
            "Takes the lead: the caller becomes its owner and holds it for the organization's `lead_hold_days` (D40); claiming again extends the hold. Taken over from another owner (their hold ran out, or they left the team), they stay involved (L9). Another member's running hold is a 409 `lead_held`; a closed lead a 409 `lead_closed`; a caller who is not a team member (an API key) a 403 `not_a_member`. Requires lead:update.",
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
            'Gives the lead back to the team \u2014 no owner, no hold; the owner stays involved. Only its owner releases it (a 403 `lead_not_yours`; an admin reassigns with PATCH); a closed lead is a 409 `lead_closed`. Requires lead:update.',
          tags: ['Lead'],
          params: leadsIdParamsDto,
        },
      },
      controller.transition('release'),
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
            "Soft-deletes a lead with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. The contact and its conversation stay. Restorable until the organization's purge window ends (D38). Requires lead:delete.",
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
          description:
            "Undoes a lead's delete. A live lead is a 409 `record_not_deleted`; an open lead whose contact has another open one a 409 `lead_open_exists` naming it (L6); a lead whose contact was removed a 409 `record_restore_conflict`. Requires lead:delete.",
          tags: ['Lead'],
          params: leadsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
