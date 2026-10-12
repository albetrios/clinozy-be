import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { ContactMessageTemplatesService } from './contact-message-templates.service.js';
import { createContactMessageTemplatesController } from './contact-message-templates.controller.js';
import {
  CreateContactMessageTemplateDto,
  UpdateContactMessageTemplateDto,
  contactMessageTemplatesIdParamsDto,
  listContactMessageTemplatesQueryDto,
} from './contact-message-templates.dto.js';

/** Registers the `contact-message-templates` routes (prefix `/api/v1/app`) — routes-final 4.D, routes 17–22. */
export function contactMessageTemplatesRoutes(
  service: ContactMessageTemplatesService,
): FastifyPluginAsync {
  const controller = createContactMessageTemplatesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/contact-message-templates',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List contact message templates',
          description:
            "Returns one page of the active organization's message templates (newest first by default; `sort=name` by name), with the total count on the first page. `q` matches the name; `type` keeps WhatsApp or Instagram templates. Requires organization:read (every member).",
          tags: ['Contact message template'],
          querystring: listContactMessageTemplatesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/contact-message-templates',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_ACTIVITY_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create contact message template',
          description:
            'Adds a reusable text for outgoing messages: `name` (1–60, unique in any case — a 409 otherwise), `body` (1–1000; `<first>` and `<interest>` are filled for each contact when it is sent) and `type` (`whatsapp` by default, or `instagram`). Requires contact_activity:create.',
          tags: ['Contact message template'],
          body: CreateContactMessageTemplateDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { contact_message_template_id: string } }>(
      '/contact-message-templates/:contact_message_template_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get contact message template',
          description:
            'Returns one live message template of the active organization; a deleted one is a 404. Requires organization:read (every member).',
          tags: ['Contact message template'],
          params: contactMessageTemplatesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { contact_message_template_id: string } }>(
      '/contact-message-templates/:contact_message_template_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_ACTIVITY_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update contact message template',
          description:
            "Changes a template's `name`, `body` or `type`. A name another live template has is a 409; send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 `record_changed` (D43). Requires contact_activity:update.",
          tags: ['Contact message template'],
          params: contactMessageTemplatesIdParamsDto,
          body: UpdateContactMessageTemplateDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { contact_message_template_id: string } }>(
      '/contact-message-templates/:contact_message_template_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_ACTIVITY_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete contact message template',
          description:
            "Soft-deletes a template with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Entries written from it keep their text. Restorable until the organization's purge window ends (D38). Requires contact_activity:delete.",
          tags: ['Contact message template'],
          params: contactMessageTemplatesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { contact_message_template_id: string } }>(
      '/contact-message-templates/:contact_message_template_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.CONTACT_ACTIVITY_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore contact message template',
          description:
            "Undoes a template's delete. A live template is a 409 `record_not_deleted`; a name reused meanwhile is a 409 `record_restore_conflict`. Requires contact_activity:delete.",
          tags: ['Contact message template'],
          params: contactMessageTemplatesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
