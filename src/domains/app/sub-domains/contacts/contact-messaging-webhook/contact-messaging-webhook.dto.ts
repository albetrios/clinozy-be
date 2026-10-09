import { z } from 'zod';

/**
 * Query of `GET /app/messaging-webhook` — Meta's subscription handshake (launch D77): Meta's own
 * parameter names, so the dotted keys stay as Meta sends them.
 */
export const messagingWebhookVerifyQueryDto = z.object({
  'hub.mode': z.string().max(32),
  'hub.verify_token': z.string().min(1).max(256),
  'hub.challenge': z.string().min(1).max(256),
});

/** {@link messagingWebhookVerifyQueryDto} parsed. */
export type MessagingWebhookVerifyQuery = z.infer<typeof messagingWebhookVerifyQueryDto>;

/**
 * Body of `POST /app/messaging-webhook` — a Meta callback (launch D77): the `object` it is about
 * (`whatsapp_business_account` or `instagram`) and its entries. Each entry's updates are kept as
 * Meta sent them; the worker reads the fields it knows.
 */
export const messagingWebhookCallbackDto = z.looseObject({
  object: z.string().min(1).max(64),
  entry: z
    .array(
      z.looseObject({
        id: z.string().min(1).max(64),
        changes: z
          .array(z.looseObject({ field: z.string(), value: z.record(z.string(), z.unknown()) }))
          .optional(),
        messaging: z.array(z.record(z.string(), z.unknown())).optional(),
      }),
    )
    .max(1000),
});

/** {@link messagingWebhookCallbackDto} parsed. */
export type MessagingWebhookCallback = z.infer<typeof messagingWebhookCallbackDto>;
