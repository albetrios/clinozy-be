import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { ContactActivitiesService } from './contact-activities.service.js';
import { createContactActivitiesController } from './contact-activities.controller.js';
import {
  AddContactNoteDto,
  ContactMessageBatchDto,
  contactActivitiesIdParamsDto,
  contactActivitiesParentParamsDto,
  LogContactCallDto,
  listContactActivitiesQueryDto,
  SendContactMessageDto,
} from './contact-activities.dto.js';

/** A record link sentence the three action routes share (M5, M10). */
const LINK_RULE =
  'At most one record link (`appointment_id`, `invoice_id`, `payment_id`, `patient_prescription_id`, `patient_offering_id`, `patient_review_id`, `patient_check_in_id`, `task_id`, `patient_treatment_id`, `patient_clinical_note_id`, `patient_image_id`, `patient_report_id`) — a live record of the organization, else a 400 naming it.';

/** Registers a contact's stream routes (prefix `/api/v1/app`) — routes-final 4.C, routes 10–16. */
export function contactActivitiesRoutes(service: ContactActivitiesService): FastifyPluginAsync {
  const controller = createContactActivitiesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { contact_id: string } }>(
      '/contacts/:contact_id/activities',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_ACTIVITY_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List contact activities',
          description:
            "Returns one page of a contact's stream — messages, call logs, notes and server events — oldest first by default (`order=desc` for the newest page), with the total on the first page. Filters: `group` and `type` (several, comma-separated), `direction`, `delivery_status`, `task_id`, `appointment_id`, `occurred_at_from` / `occurred_at_to` (`to` exclusive), `q` on the text; `sort` `occurred_at` | `created_at`. An entry linked to a record the caller cannot read is left out (M10). The Chat tab's count is `direction=received&occurred_at_from=<the contact's last_sent_at>`. Requires contact_activity:read.",
          tags: ['Contact activity'],
          params: contactActivitiesParentParamsDto,
          querystring: listContactActivitiesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { contact_id: string } }>(
      '/contacts/:contact_id/activities/send-message',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_ACTIVITY_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Send contact message',
          description: `Writes a WhatsApp or Instagram message to the contact (\`type\`, \`body\` 1–1000): sent by the caller, \`delivery_status\` \`queued\` until the messaging worker sends it (M8). \`<first>\` and \`<interest>\` in the body are filled for the contact; \`contact_message_template_id\` must be a template of the same type, \`attachment_keys\` up to 5 confirmed uploads of the organization, \`reply_to_contact_activity_id\` an entry of this contact. ${LINK_RULE} The contact's last activity, last sent time and default channel move with it. Requires contact_activity:create.`,
          tags: ['Contact activity'],
          params: contactActivitiesParentParamsDto,
          body: SendContactMessageDto,
        },
      },
      controller.createNamed('send-message'),
    );
    zodApplication.post<{ Params: { contact_id: string } }>(
      '/contacts/:contact_id/activities/log-call',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_ACTIVITY_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Log contact call',
          description: `Records a call that happened (\`type\` \`call_log\`): \`direction\` \`sent\` (the team called) or \`received\` (the person called), \`body\` 1–1000 — what happened. An outgoing call is the caller's and sets the contact's default channel to \`call\`; an incoming one has no author and marks the contact as awaiting a reply. \`reply_to_contact_activity_id\` must be an entry of this contact. ${LINK_RULE} Requires contact_activity:create.`,
          tags: ['Contact activity'],
          params: contactActivitiesParentParamsDto,
          body: LogContactCallDto,
        },
      },
      controller.createNamed('log-call'),
    );
    zodApplication.post<{ Params: { contact_id: string } }>(
      '/contacts/:contact_id/activities/add-note',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_ACTIVITY_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add contact note',
          description: `Adds an internal note for the team (\`type\` \`note\`, never sent): \`body\` 1–1000, \`attachment_keys\` up to 5 confirmed uploads of the organization. ${LINK_RULE} Requires contact_activity:create.`,
          tags: ['Contact activity'],
          params: contactActivitiesParentParamsDto,
          body: AddContactNoteDto,
        },
      },
      controller.createNamed('add-note'),
    );
    zodApplication.get<{ Params: { contact_id: string; contact_activity_id: string } }>(
      '/contacts/:contact_id/activities/:contact_activity_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_ACTIVITY_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get contact activity',
          description:
            "Returns one entry of the contact's stream; an entry of another contact, or one linked to a record the caller cannot read, is a 404. Requires contact_activity:read.",
          tags: ['Contact activity'],
          params: contactActivitiesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.post<{ Params: { contact_id: string; contact_activity_id: string } }>(
      '/contacts/:contact_id/activities/:contact_activity_id/resend',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_ACTIVITY_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Resend contact message',
          description:
            'Puts a failed WhatsApp or Instagram message back in the queue (`delivery_status` `queued`, the failure cleared). An entry that has not failed — or is not a message — is a 409 `transition_not_allowed`. Requires contact_activity:update.',
          tags: ['Contact activity'],
          params: contactActivitiesIdParamsDto,
        },
      },
      controller.transition('resend'),
    );
    zodApplication.post(
      '/contact-activities/message-batches',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_ACTIVITY_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Send contact message batch',
          description:
            'Writes one queued WhatsApp or Instagram message per contact (`contact_ids` 1–200, each once; an unknown or deleted one is a 400 naming it), with `<first>` and `<interest>` filled for each; `contact_message_template_id` must be a template of the same type. Answers the entries written, in the order of `contact_ids`. Requires contact_activity:create.',
          tags: ['Contact activity'],
          body: ContactMessageBatchDto,
        },
      },
      controller.collectionAction('message-batches'),
    );
  };
}
