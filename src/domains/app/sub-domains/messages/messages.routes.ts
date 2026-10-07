import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { MessagesService } from './messages.service.js';
import { createMessagesController } from './messages.controller.js';
import {
  CreateMessageDto,
  batchesMessagesBodyDto,
  listMessagesQueryDto,
  messagesIdParamsDto,
} from './messages.dto.js';

/** Registers the `messages` routes (prefix `/api/v1/app`). */
export function messagesRoutes(service: MessagesService): FastifyPluginAsync {
  const controller = createMessagesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/messages',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List messages',
          description:
            "Returns one page of the active organization's messages (newest first by default), with the total count; `q` searches, filters narrow. Requires lead:read.",
          tags: ['Message'],
          querystring: listMessagesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/messages',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create message',
          description: 'Adds a message to the active organization. Requires lead:update.',
          tags: ['Message'],
          body: CreateMessageDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { message_id: string } }>(
      '/messages/:message_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get message',
          description: 'Returns one message of the active organization. Requires lead:read.',
          tags: ['Message'],
          params: messagesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.post<{ Params: { message_id: string } }>(
      '/messages/:message_id/resend',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Resend message',
          description:
            'Queues a failed line again (D40: a retry never sends twice \u2014 the same line is re-sent). A message whose status does not allow it is a 409. Requires lead:update.',
          tags: ['Message'],
          params: messagesIdParamsDto,
        },
      },
      controller.transition('resend'),
    );
    zodApplication.post(
      '/messages/batches',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LEAD_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Send a message to many contacts',
          description:
            'Writes one line per contact \u2014 `contact_ids` are patient (pat_), lead (lead_) or walk-in buyer (mcon_) ids \u2014 with the same side effects as a single line: a new lead moves to Contacted and its last touch is now. Answers the lines written. Requires lead:update.',
          tags: ['Message'],
          body: batchesMessagesBodyDto,
        },
      },
      controller.collectionAction('batches'),
    );
  };
}
