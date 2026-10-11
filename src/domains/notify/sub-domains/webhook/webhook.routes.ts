import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
  STRICT_AUTHED_RATE_LIMIT,
} from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import {
  assertOrganizationPermission,
  requireOrganizationPermission,
} from '@/shared/utils/auth/authorization.util.js';
import { NOTIFY_PERMISSIONS } from '@/domains/notify/notify.permissions.js';
import { requireOrganizationScope } from '@/shared/utils/http/request.util.js';
import { validatePublicIdParam } from '@/shared/utils/identity/public-id-param.util.js';
import type { WebhookService } from './webhook.service.js';
import type { WebhookEventService } from './webhook-event/webhook-event.service.js';
import { createWebhookController } from './webhook.controller.js';
import { createWebhookEventController } from './webhook-event/webhook-event.controller.js';
import {
  WEBHOOK_EVENT_READ_PERMISSION,
  type WebhookEventType,
} from './webhook-event/webhook-event.constants.js';
import {
  CreateWebhookDto,
  listWebhookDeliveryAttemptsQueryDto,
  listWebhooksQueryDto,
  UpdateWebhookDto,
  webhookIdParamsDto,
} from './webhook.dto.js';

/**
 * PreHandler for webhook create/update: the principal must hold the read permission behind every
 * event the webhook will deliver ({@link WEBHOOK_EVENT_READ_PERMISSION}). Without it a
 * `webhook:manage`-only role or API key could receive member emails it cannot read through the API.
 *
 * @remarks
 * - **Algorithm:** create checks the requested `events`. Update (given `webhookService`) checks the
 *   requested events AND the stored ones: an update keeps delivering what the webhook already
 *   receives, and its pending attempts go to whatever URL the row holds at delivery time — so
 *   pointing a `membership.*` webhook at a new URL needs `membership:read` even when `events` is
 *   absent from the body.
 * - **Failure modes:** 403 without a permission (with a deny audit row); 404 when the webhook to
 *   update does not exist in the organization. Runs after body validation, so the requested
 *   `events` hold catalog types only.
 */
function requireWebhookEventReadPermissions(
  webhookService?: WebhookService,
): (request: FastifyRequest) => Promise<void> {
  return async (request) => {
    const { events } = (request.body ?? {}) as { events?: readonly string[] };
    const deliveredEvents = new Set<string>(events ?? []);
    const { webhook_id: webhookPublicId } = (request.params ?? {}) as { webhook_id?: string };
    if (webhookService !== undefined && webhookPublicId !== undefined) {
      const stored = await webhookService.get({
        scope: requireOrganizationScope(request),
        webhook_public_id: validatePublicIdParam({
          value: webhookPublicId,
          fieldName: 'webhook_id',
        }),
      });
      for (const eventType of stored.events as readonly string[]) deliveredEvents.add(eventType);
    }
    const permissionCodes = new Set<string>();
    for (const eventType of deliveredEvents) {
      const permissionCode = WEBHOOK_EVENT_READ_PERMISSION[eventType as WebhookEventType];
      if (typeof permissionCode === 'string') permissionCodes.add(permissionCode);
    }
    for (const permissionCode of permissionCodes) {
      await assertOrganizationPermission({ request, permissionCode });
    }
  };
}

/**
 * Returns a Fastify plugin that registers the organization-scoped webhook HTTP routes (catalog,
 * list, get, create, update, delete, delivery attempts, test) plus their permission preHandlers
 * (`webhook:read` / `webhook:manage`) and rate-limit presets.
 */
export function webhookRoutes({
  webhookService,
  webhookEventService,
}: {
  webhookService: WebhookService;
  webhookEventService: WebhookEventService;
}): FastifyPluginAsync {
  const webhookController = createWebhookController(webhookService);
  const webhookEventController = createWebhookEventController(webhookEventService);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/webhook-events',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(NOTIFY_PERMISSIONS.WEBHOOK_READ)],
        schema: {
          summary: 'List dispatchable webhook event types',
          description:
            "Returns the catalog of event types this platform can dispatch, so a client can build a webhook subscription list. These are event TYPES, not the organization's delivery history — for that, use GET /notify/webhooks/{webhook_id}/delivery-attempts. Requires WEBHOOK_READ permission.",
          tags: ['Webhook'],
        },
      },
      webhookEventController.listWebhookEvents,
    );
    zodApplication.get(
      '/webhooks',
      {
        schema: {
          summary: 'List webhooks',
          description:
            'Returns all configured webhooks for the organization. Requires WEBHOOK_READ permission.',
          tags: ['Webhook'],
          querystring: listWebhooksQueryDto,
        },
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(NOTIFY_PERMISSIONS.WEBHOOK_READ)],
      },
      webhookController.listWebhooks,
    );
    zodApplication.get<{ Params: { webhook_id: string } }>(
      '/webhooks/:webhook_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(NOTIFY_PERMISSIONS.WEBHOOK_READ)],
        schema: {
          summary: 'Get webhook',
          description: 'Returns a single webhook configuration. Requires WEBHOOK_READ permission.',
          tags: ['Webhook'],
          params: webhookIdParamsDto,
        },
      },
      webhookController.getWebhook,
    );
    zodApplication.post(
      '/webhooks',
      {
        onRequest: [app.authenticate],
        preHandler: [
          requireOrganizationPermission(NOTIFY_PERMISSIONS.WEBHOOK_MANAGE),
          requireWebhookEventReadPermissions(),
        ],
        config: { idempotencyRequired: true, ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config },
        schema: {
          summary: 'Create webhook',
          description:
            'Creates a new webhook endpoint. Specify the URL and events to subscribe to. Requires WEBHOOK_MANAGE permission, plus the read permission behind each subscribed event (MEMBERSHIP_READ for membership events, SUBSCRIPTION_READ for subscription events).',
          tags: ['Webhook'],
          body: CreateWebhookDto,
        },
      },
      webhookController.createWebhook,
    );
    zodApplication.patch<{ Params: { webhook_id: string } }>(
      '/webhooks/:webhook_id',
      {
        onRequest: [app.authenticate],
        preHandler: [
          requireOrganizationPermission(NOTIFY_PERMISSIONS.WEBHOOK_MANAGE),
          requireWebhookEventReadPermissions(webhookService),
        ],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update webhook',
          description:
            'Updates a webhook URL, events, or enabled status. Requires WEBHOOK_MANAGE permission, plus the read permission behind each event the webhook already receives or will receive.',
          tags: ['Webhook'],
          params: webhookIdParamsDto,
          body: UpdateWebhookDto,
        },
      },
      webhookController.updateWebhook,
    );
    zodApplication.delete<{ Params: { webhook_id: string } }>(
      '/webhooks/:webhook_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(NOTIFY_PERMISSIONS.WEBHOOK_MANAGE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete webhook',
          description:
            'Deletes a webhook endpoint: deliveries stop at once and the row is hard-deleted after TOMBSTONE_RETENTION_DAYS (default 90); registering the same URL again restores it. Requires WEBHOOK_MANAGE permission.',
          tags: ['Webhook'],
          params: webhookIdParamsDto,
        },
      },
      webhookController.deleteWebhook,
    );
    zodApplication.get<{ Params: { webhook_id: string } }>(
      '/webhooks/:webhook_id/delivery-attempts',
      {
        schema: {
          summary: 'List webhook delivery attempts',
          description:
            'Returns the delivery attempt history for a webhook, including status codes and response times. Requires WEBHOOK_READ permission.',
          tags: ['Webhook'],
          params: webhookIdParamsDto,
          querystring: listWebhookDeliveryAttemptsQueryDto,
        },
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(NOTIFY_PERMISSIONS.WEBHOOK_READ)],
      },
      webhookController.listDeliveryAttempts,
    );
    zodApplication.post<{ Params: { webhook_id: string } }>(
      '/webhooks/:webhook_id/test',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(NOTIFY_PERMISSIONS.WEBHOOK_MANAGE)],
        ...STRICT_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Send test webhook',
          description:
            'Sends a test event to the webhook URL to verify connectivity. Requires WEBHOOK_MANAGE permission.',
          tags: ['Webhook'],
          params: webhookIdParamsDto,
        },
      },
      webhookController.testWebhook,
    );
  };
}
