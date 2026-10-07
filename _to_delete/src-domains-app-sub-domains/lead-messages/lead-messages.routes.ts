import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { LeadMessagesService } from './lead-messages.service.js';
import { createLeadMessagesController } from './lead-messages.controller.js';
import {
  CreateLeadMessageDto,
  batchesLeadMessagesBodyDto,
  leadMessagesIdParamsDto,
  leadMessagesParentParamsDto,
  listLeadMessagesQueryDto,
} from './lead-messages.dto.js';

/** Registers the `lead-messages` routes (prefix `/api/v1/app`). */
export function leadMessagesRoutes(service: LeadMessagesService): FastifyPluginAsync {
  const controller = createLeadMessagesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { lead_id: string } }>(
      '/leads/:lead_id/messages',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a lead's lead messages",
          description:
            'Returns one page of the lead messages of a lead (newest first), with the total count. Requires lead:read.',
          tags: ['Lead'],
          params: leadMessagesParentParamsDto,
          querystring: listLeadMessagesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { lead_id: string } }>(
      '/leads/:lead_id/messages',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a lead message',
          description: 'Adds a lead message to a lead. Requires lead:update.',
          tags: ['Lead'],
          params: leadMessagesParentParamsDto,
          body: CreateLeadMessageDto,
        },
      },
      controller.create,
    );
    zodApplication.post<{ Params: { lead_message_id: string } }>(
      '/lead-messages/:lead_message_id/resend',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Resend message',
          description:
            'Queues a failed message again (D40: a retry never sends twice \u2014 the same line is re-sent). A lead message whose status does not allow it is a 409. Requires lead:update.',
          tags: ['Lead'],
          params: leadMessagesIdParamsDto,
        },
      },
      controller.transition('resend'),
    );
    zodApplication.post(
      '/lead-messages/batches',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Send a message to many leads',
          description:
            'Writes one message line per lead (bulk message, schema-routes.md:1596) with the same side effects as a single message \u2014 a new lead moves to Contacted, its last touch is now. Answers the lines written. Requires lead:update.',
          tags: ['Lead'],
          body: batchesLeadMessagesBodyDto,
        },
      },
      controller.collectionAction('batches'),
    );
  };
}
