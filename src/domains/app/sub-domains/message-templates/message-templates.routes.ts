import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { MessageTemplatesService } from './message-templates.service.js';
import { createMessageTemplatesController } from './message-templates.controller.js';
import {
  CreateMessageTemplateDto,
  UpdateMessageTemplateDto,
  listMessageTemplatesQueryDto,
  messageTemplatesIdParamsDto,
} from './message-templates.dto.js';

/** Registers the `message-templates` routes (prefix `/api/v1/app`). */
export function messageTemplatesRoutes(service: MessageTemplatesService): FastifyPluginAsync {
  const controller = createMessageTemplatesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/message-templates',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List message templates',
          description:
            "Returns one page of the active organization's message templates (newest first by default), with the total count; `q` searches, filters narrow. Requires lead:read.",
          tags: ['Lead'],
          querystring: listMessageTemplatesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/message-templates',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MESSAGE_TEMPLATE_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create message template',
          description:
            'Adds a message template to the active organization. Requires message_template:create.',
          tags: ['Lead'],
          body: CreateMessageTemplateDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { message_template_id: string } }>(
      '/message-templates/:message_template_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get message template',
          description:
            'Returns one message template of the active organization. Requires lead:read.',
          tags: ['Lead'],
          params: messageTemplatesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { message_template_id: string } }>(
      '/message-templates/:message_template_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MESSAGE_TEMPLATE_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update message template',
          description:
            "Changes any of a message template's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires message_template:update.",
          tags: ['Lead'],
          params: messageTemplatesIdParamsDto,
          body: UpdateMessageTemplateDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { message_template_id: string } }>(
      '/message-templates/:message_template_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MESSAGE_TEMPLATE_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete message template',
          description:
            "Soft-deletes a message template with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires message_template:delete.",
          tags: ['Lead'],
          params: messageTemplatesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { message_template_id: string } }>(
      '/message-templates/:message_template_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MESSAGE_TEMPLATE_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore message template',
          description:
            "Undoes a message template's delete. A live message template is a 409. Requires message_template:delete.",
          tags: ['Lead'],
          params: messageTemplatesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
