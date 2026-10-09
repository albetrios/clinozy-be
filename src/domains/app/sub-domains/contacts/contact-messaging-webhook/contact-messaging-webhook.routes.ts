import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { WEBHOOK_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { registerRawBodyRoute } from '@/shared/utils/http/raw-body-route.registry.js';
import { MESSAGING_WEBHOOK_BODY_LIMIT_BYTES } from './contact-messaging-webhook.constants.js';
import {
  messagingWebhookCallbackDto,
  messagingWebhookVerifyQueryDto,
} from './contact-messaging-webhook.dto.js';
import {
  contactMessagingWebhookIngressPlugin,
  META_SIGNATURE_HEADER,
} from './contact-messaging-webhook-ingress.plugin.js';
import { createContactMessagingWebhookController } from './contact-messaging-webhook.controller.js';
import type { ContactMessagingWebhookService } from './contact-messaging-webhook.service.js';

/**
 * Registers the messaging webhook (prefix `/api/v1/app`, launch D77) — the platform Meta app's
 * callback URL for WhatsApp and Instagram: `GET` answers the subscription handshake, `POST`
 * takes the signed callbacks (the raw body is kept for `X-Hub-Signature-256`).
 */
export function contactMessagingWebhookRoutes(
  service: ContactMessagingWebhookService,
): FastifyPluginAsync {
  const controller = createContactMessagingWebhookController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    // The raw body of a signed callback is kept for the signature check (sec-B #7 registry).
    app.addHook('onRoute', (routeOptions) => {
      if ((routeOptions.config as Record<string, unknown> | undefined)?.captureRawBody === true) {
        registerRawBodyRoute({ url: routeOptions.url, signatureHeader: META_SIGNATURE_HEADER });
      }
    });
    await contactMessagingWebhookIngressPlugin(app, {});
    zodApplication.get(
      '/messaging-webhook',
      {
        ...WEBHOOK_RATE_LIMIT,
        schema: {
          summary: 'Messaging webhook handshake',
          description:
            "Meta's subscription handshake for the platform app's WhatsApp and Instagram webhook (launch D77): with `hub.mode=subscribe` and `hub.verify_token` equal to `META_WEBHOOK_VERIFY_TOKEN`, answers `hub.challenge` as plain text; another mode or token is a 403 `verify_token_mismatch`. Public — no authentication; 503 while the webhook is not configured (`META_APP_SECRET` and `META_WEBHOOK_VERIFY_TOKEN`).",
          tags: ['Messaging webhook'],
          querystring: messagingWebhookVerifyQueryDto,
        },
      },
      controller.verify,
    );
    zodApplication.post(
      '/messaging-webhook',
      {
        ...WEBHOOK_RATE_LIMIT,
        config: { ...WEBHOOK_RATE_LIMIT.config, captureRawBody: true },
        bodyLimit: MESSAGING_WEBHOOK_BODY_LIMIT_BYTES,
        schema: {
          summary: 'Messaging webhook callback',
          description:
            "Takes a signed Meta callback (launch D77, WC-1 statuses, WC-3 replies): `X-Hub-Signature-256` must be `sha256=` + the HMAC-SHA256 of the raw JSON body under `META_APP_SECRET`, else a 400. Each WhatsApp `messages` change and Instagram `messaging` event is stored for the clinic whose settings hold the account it came to (an account no clinic connected is skipped) — a retried update once — and applied by the messaging worker: delivery reports move a sent message forward (sent → delivered → read, or failed), replies join the person's conversation, and a WhatsApp number nobody has becomes a new contact with a lead. Answers `stored_count`, the updates that were new. Public — no authentication; 503 while the webhook is not configured.",
          tags: ['Messaging webhook'],
          body: messagingWebhookCallbackDto,
        },
      },
      controller.receive,
    );
  };
}
