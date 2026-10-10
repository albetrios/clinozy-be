import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import {
  webhook_delivery_attempts,
  webhooks,
} from '@/domains/notify/sub-domains/webhook/webhook.schema.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { encryptFieldSecret } from '@/shared/utils/security/field-secret-encryption.util.js';

export interface CreateWebhookOptions {
  organizationId: number;
  url?: string;
  events?: string[];
  isEnabled?: boolean;
  createdByUserId?: number;
}

/**
 * Create a test webhook in the database.
 */
export async function createTestWebhook(options: CreateWebhookOptions) {
  const publicId = generatePublicId('webhook');
  const [webhook] = await getOperatorDatabase()
    .insert(webhooks)
    .values({
      public_id: publicId,
      organization_id: options.organizationId,
      url: options.url ?? 'https://httpbin.org/post',
      // Store a properly-encrypted secret (as production does) — decryptFieldSecret is now
      // fail-closed and rejects unprefixed plaintext.
      encrypted_secret: encryptFieldSecret('test-secret'),
      events: options.events ?? ['subscription.updated'],
      is_enabled: options.isEnabled ?? true,
      created_by_user_id: options.createdByUserId,
    })
    .returning();
  return webhook!;
}

export interface CreateWebhookDeliveryAttemptOptions {
  webhookId: number;
  eventType?: string;
  payload?: Record<string, unknown>;
  status?: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  attemptCount?: number;
}

/**
 * Create a webhook delivery attempt row (PENDING, no attempts yet, by default) — the row a
 * delivery job is enqueued for. Returns the internal id (for direct row reads) and the public id
 * (the job's handle).
 */
export async function createTestWebhookDeliveryAttempt(
  options: CreateWebhookDeliveryAttemptOptions,
): Promise<{ id: number; publicId: string }> {
  const [attempt] = await getOperatorDatabase()
    .insert(webhook_delivery_attempts)
    .values({
      public_id: generatePublicId('webhookDeliveryAttempt'),
      webhook_id: options.webhookId,
      event_type: options.eventType ?? 'webhook.test',
      payload: options.payload ?? { hello: 'world' },
      status: options.status ?? 'PENDING',
      attempt_count: options.attemptCount ?? 0,
    })
    .returning({
      id: webhook_delivery_attempts.id,
      publicId: webhook_delivery_attempts.public_id,
    });
  return attempt!;
}
