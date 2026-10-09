import type { FastifyPluginAsync } from 'fastify';
import {
  isMetaWebhookIngressConfigured,
  verifyMetaWebhookSignature,
} from '@/infrastructure/messaging/meta-messaging.config.js';
import { ServiceUnavailableError, ValidationError } from '@/shared/errors/index.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/** The header Meta signs every callback with (`sha256=<hex HMAC of the raw body>`). */
export const META_SIGNATURE_HEADER = 'x-hub-signature-256';

/**
 * Guards the messaging webhook (launch D77): the routes registered after it answer 503 while the
 * webhook is not configured, and every callback (`POST`) must carry Meta's signature of its raw
 * body — the handshake (`GET`) is checked by its verify token instead.
 *
 * @remarks
 * - **Algorithm:** a `preHandler`: not configured → 503; a `POST` without `X-Hub-Signature-256`,
 *   without the captured raw body, or whose signature does not match → 400.
 * - **Failure modes:** `ServiceUnavailableError`, `ValidationError` — nothing is stored.
 * - **Side effects:** a warn log on a signature mismatch.
 */
export const contactMessagingWebhookIngressPlugin: FastifyPluginAsync = async (application) => {
  application.addHook('preHandler', async (request) => {
    if (!isMetaWebhookIngressConfigured()) {
      throw new ServiceUnavailableError('errors:messagingWebhookNotConfigured');
    }
    if (request.method !== 'POST') return;
    const signature = request.headers[META_SIGNATURE_HEADER];
    if (typeof signature !== 'string' || signature.length === 0) {
      throw new ValidationError('errors:missingMetaSignature');
    }
    const rawBody = request.rawBody;
    if (!rawBody) throw new ValidationError('errors:missingRawBody');
    if (!verifyMetaWebhookSignature(rawBody, signature)) {
      logger.warn({ requestId: request.id }, 'messaging-webhook.verification_failed');
      throw new ValidationError('errors:metaWebhookVerificationFailed');
    }
  });
};
