import type { FastifyReply, FastifyRequest } from 'fastify';
import { NotFoundError } from '@/shared/errors/index.js';
import { paginatedResponse, successResponse } from '@/shared/utils/http/response.util.js';
import { getRequestIdentifier, requireUserScope } from '@/shared/utils/http/request.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import type { NotificationService } from './notification.service.js';
import { NotificationSerializer } from './notification.serializer.js';
import { validateListNotificationsQuery } from './notification.validator.js';

/**
 * Build the Fastify handler map for notification routes — thin coordinators that parse params,
 * call {@link NotificationService}, and shape responses via {@link NotificationSerializer}.
 */
export function createNotificationController(service: NotificationService) {
  return {
    listNotifications: async (request: FastifyRequest, _reply: FastifyReply) => {
      const scope = requireUserScope(request);
      const parsed = validateListNotificationsQuery(request.query);
      const result = await service.listForUser({
        scope,
        options: omitUndefined({
          after: parsed.after,
          limit: parsed.limit,
          include_total: parsed.include_total === 'true',
        }),
      });
      const serialized = NotificationSerializer.many(result.items);
      return paginatedResponse({
        data: serialized,
        request_id: getRequestIdentifier(request),
        pagination: {
          per_page: result.limit,
          next: result.next_cursor,
          has_more: result.has_more,
          ...(result.total !== null ? { estimated_total: result.total } : {}),
        },
      });
    },
    getNotification: async (
      request: FastifyRequest<{ Params: { notification_id: string } }>,
      _reply: FastifyReply,
    ) => {
      const scope = requireUserScope(request);
      const notification = await service.get({ public_id: request.params.notification_id, scope });
      if (!notification) throw new NotFoundError('Notification');
      return successResponse({
        data: NotificationSerializer.one(notification),
        request_id: getRequestIdentifier(request),
      });
    },
    markNotificationRead: async (
      request: FastifyRequest<{ Params: { notification_id: string } }>,
      _reply: FastifyReply,
    ) => {
      const scope = requireUserScope(request);
      const notification = await service.markRead({
        public_id: request.params.notification_id,
        scope,
      });
      if (!notification) throw new NotFoundError('Notification');
      return successResponse({
        data: NotificationSerializer.one(notification),
        request_id: getRequestIdentifier(request),
      });
    },
    markAllRead: async (request: FastifyRequest, _reply: FastifyReply) => {
      const scope = requireUserScope(request);
      const updatedCount = await service.markAllRead(scope);
      return successResponse({
        data: { updated_count: updatedCount },
        request_id: getRequestIdentifier(request),
      });
    },
    getUnreadCount: async (request: FastifyRequest, _reply: FastifyReply) => {
      const scope = requireUserScope(request);
      const count = await service.getUnreadCount(scope);
      return successResponse({ data: { count }, request_id: getRequestIdentifier(request) });
    },
    deleteNotification: async (
      request: FastifyRequest<{ Params: { notification_id: string } }>,
      reply: FastifyReply,
    ) => {
      const scope = requireUserScope(request);
      const deleted = await service.deleteNotification({
        public_id: request.params.notification_id,
        scope,
      });
      if (!deleted) throw new NotFoundError('Notification');
      return reply.code(204).send();
    },
  };
}
