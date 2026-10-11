import type { FastifyReply, FastifyRequest } from 'fastify';
import { successResponse } from '@/shared/utils/http/response.util.js';
import { getRequestIdentifier } from '@/shared/utils/http/request.util.js';
import type { MessagingWebhookVerifyQuery } from './contact-messaging-webhook.dto.js';
import type { ContactMessagingWebhookService } from './contact-messaging-webhook.service.js';

/**
 * HTTP handlers for the messaging webhook (launch D77): Meta's handshake answers the bare
 * challenge as text, a callback the stored count.
 */
export function createContactMessagingWebhookController(service: ContactMessagingWebhookService) {
  return {
    /** `GET /messaging-webhook` — the subscription handshake. */
    verify: async (request: FastifyRequest, reply: FastifyReply) => {
      const challenge = service.verify(request.query as MessagingWebhookVerifyQuery);
      return reply.type('text/plain; charset=utf-8').send(challenge);
    },
    /** `POST /messaging-webhook` — a signed callback. */
    receive: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await service.receive(request.body);
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
  };
}
