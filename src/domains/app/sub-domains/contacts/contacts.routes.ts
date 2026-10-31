import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { ContactsService } from './contacts.service.js';
import { createContactsController } from './contacts.controller.js';
import {
  CreateContactDto,
  UpdateContactDto,
  contactsIdParamsDto,
  listContactsQueryDto,
} from './contacts.dto.js';

/** Registers the `contacts` routes (prefix `/api/v1/app`) — routes-final 4.A, routes 1–7. */
export function contactsRoutes(service: ContactsService): FastifyPluginAsync {
  const controller = createContactsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/contacts',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List contacts',
          description:
            "Returns one page of the active organization's contacts — the one search every picker uses (CT9). `q` matches when every word of it does, in any order (`iyer meera`, `Meera 98250` — a number inside the text read as its digits), each word a name or part of one, the email, an Instagram handle, any number (4+ digits), a whole contact number (`C-12345`), the number of the person's patient file or lead (`#2371` — either: patients and leads are numbered apart, so one `#n` may find two people) or a patient number (`PT-0412`); text needs 3+ characters (a 400 otherwise). Sort `name` (default — the best match first while `q` is set), `created_at` or `last_activity_at` (newest first). Filters: `phone` (every contact with that number, household included), `ids` (up to 100, CT12), `is_patient`, `has_open_lead`, `is_awaiting_reply`, `member_membership_id` (\"my people\"), `household_contact_id`, `preference_tags` (comma-separated — any of), `age_from` / `age_to` (whole years, inclusive — real and approximate birth dates alike; a contact without one never matches). Each contact carries `age` (whole years on the organization's today, null without a birth date) and `date_of_birth_is_approximate`. The list carries `primary_phone`, not `phones`. Requires contact:read.",
          tags: ['Contact'],
          querystring: listContactsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/contacts',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create contact',
          description:
            "Adds a person: `first_name` and 1–5 `phones` (`+91` and 10 digits, each once, exactly one `is_primary`). `household_contact_id` puts them in that contact's household (absent = their own); a number may sit on several contacts only inside one household — a number on another household is a 409 `contact_phone_exists` naming that contact (CT3). `date_of_birth` not in the future, `referred_by_contact_id` only with `referral_source` patient (400s, CT13); `age` (whole years 0–120) instead of `date_of_birth` stores the organization's today minus that many years with `date_of_birth_is_approximate` true — both in one body is a 400; `preference_tags` are lowercase keys (`no_calls`), up to 12 (CT14). Requires contact:create.",
          tags: ['Contact'],
          body: CreateContactDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { contact_id: string } }>(
      '/contacts/:contact_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get contact',
          description:
            'Returns one live contact of the active organization with its `phones` (the primary first); a deleted one is a 404. Requires contact:read.',
          tags: ['Contact'],
          params: contactsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { contact_id: string } }>(
      '/contacts/:contact_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update contact',
          description:
            "Changes any of a contact's fields — the change applies everywhere the person appears (lead, patient file, appointments, activity). Null clears an optional field; `phones` replaces the whole set; `household_contact_id` moves them to that contact's household (null = their own; the first contact of a household with others in it stays — a 400). `age` (whole years 0–120) stores an approximate `date_of_birth` and turns `date_of_birth_is_approximate` on; a sent `date_of_birth` turns it off (null clears both); `age` with `date_of_birth` is a 400. A number on another household is a 409 `contact_phone_exists`. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` (D43). Requires contact:update.",
          tags: ['Contact'],
          params: contactsIdParamsDto,
          body: UpdateContactDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { contact_id: string } }>(
      '/contacts/:contact_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete contact',
          description:
            "Soft-deletes a contact with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Its numbers leave with it, free for another household. A contact a live lead, patient file or appointment points at cannot be removed — a 409 `contact_in_use` (CT7). Restorable until the organization's purge window ends (D38). Requires contact:delete.",
          tags: ['Contact'],
          params: contactsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { contact_id: string } }>(
      '/contacts/:contact_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore contact',
          description:
            "Undoes a contact's delete, with its numbers. A live contact is a 409 `record_not_deleted`; a number another household took meanwhile is a 409 `contact_phone_exists` naming that contact. Requires contact:delete.",
          tags: ['Contact'],
          params: contactsIdParamsDto,
        },
      },
      controller.restore,
    );
    zodApplication.get<{ Params: { contact_id: string } }>(
      '/contacts/:contact_id/preview',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Preview contact',
          description:
            'The hover card: the contact (with `primary_phone`, not `phones`) plus `open_lead` (`id`, `status`, `owner_membership_id`), `patient` (`id`, `patient_number`), `next_appointment` and `last_appointment` (`id`, `appointment_date`, `start_time`, `service_label`, `status` — only for appointment:read holders), each null when there is none. Requires contact:read.',
          tags: ['Contact'],
          params: contactsIdParamsDto,
        },
      },
      controller.view('preview'),
    );
  };
}
