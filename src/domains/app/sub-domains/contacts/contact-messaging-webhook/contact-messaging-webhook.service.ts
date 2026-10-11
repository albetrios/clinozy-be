import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { matchesMetaWebhookVerifyToken } from '@/infrastructure/messaging/meta-messaging.config.js';
import { ForbiddenError, ValidationError } from '@/shared/errors/index.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  MESSAGING_WEBHOOK_CHANNEL,
  META_INSTAGRAM_OBJECT,
  META_WHATSAPP_OBJECT,
} from './contact-messaging-webhook.constants.js';
import {
  type MessagingWebhookCallback,
  messagingWebhookCallbackDto,
  type MessagingWebhookVerifyQuery,
} from './contact-messaging-webhook.dto.js';
import type { ContactMessagingWebhookRepository } from './contact-messaging-webhook.repository.js';
import type { MessagingWebhookUpdate } from './contact-messaging-webhook.types.js';
import { requestMessagingWebhookEventProcessing } from './queues/messaging-webhook-event.queue.js';

/**
 * A callback's updates, one per WhatsApp `messages` change or Instagram `messaging` event, each
 * with the clinic account it came to.
 *
 * @remarks
 * - **Algorithm:** a `whatsapp_business_account` callback gives each `messages` change (its
 *   `metadata.phone_number_id` the account); an `instagram` callback each `messaging` event (the
 *   entry's id the account). Anything else Meta sends — other fields, other objects — is not a
 *   message and is left out.
 * - **Failure modes:** none — pure.
 */
export function extractMessagingWebhookUpdates(
  callback: MessagingWebhookCallback,
): MessagingWebhookUpdate[] {
  const updates: MessagingWebhookUpdate[] = [];
  for (const entry of callback.entry) {
    if (callback.object === META_WHATSAPP_OBJECT) {
      for (const change of entry.changes ?? []) {
        const accountId = (change.value.metadata as { phone_number_id?: unknown } | undefined)
          ?.phone_number_id;
        if (change.field !== 'messages' || typeof accountId !== 'string') continue;
        updates.push({
          channel: MESSAGING_WEBHOOK_CHANNEL.WHATSAPP,
          accountId,
          payload: change.value,
        });
      }
    } else if (callback.object === META_INSTAGRAM_OBJECT) {
      for (const event of entry.messaging ?? []) {
        updates.push({
          channel: MESSAGING_WEBHOOK_CHANNEL.INSTAGRAM,
          accountId: entry.id,
          payload: event,
        });
      }
    }
  }
  return updates;
}

/**
 * The messaging webhook (launch D77, WC-1 statuses, WC-3 replies): Meta's subscription handshake,
 * and each signed callback stored for its organization before the 200.
 *
 * @remarks
 * - **Algorithm:** `verify` answers the handshake's challenge when the mode is `subscribe` and
 *   the token is ours. `receive` splits a callback ({@link extractMessagingWebhookUpdates}),
 *   finds each account's organization (the SECURITY DEFINER resolver), stores that organization's
 *   updates in its context (a retried update is skipped) and, after the commit, asks for its
 *   processing job. An account no clinic connected is logged and left out — Meta still gets its 200.
 * - **Failure modes:** `ForbiddenError` for a handshake with another token or mode;
 *   `ValidationError` for a callback body that is not one; database errors propagate (Meta
 *   retries the callback).
 * - **Side effects:** `app.messaging_webhook_events` rows; processing jobs.
 */
export class ContactMessagingWebhookService {
  constructor(private readonly repository: ContactMessagingWebhookRepository) {}

  /** The handshake: the challenge to echo back. */
  verify(query: MessagingWebhookVerifyQuery): string {
    if (
      query['hub.mode'] !== 'subscribe' ||
      !matchesMetaWebhookVerifyToken(query['hub.verify_token'])
    ) {
      throw new ForbiddenError('errors:messagingWebhookVerifyTokenMismatch').withReason(
        'verify_token_mismatch',
      );
    }
    return query['hub.challenge'];
  }

  /** Stores a verified callback's updates; answers how many were new. */
  async receive(body: unknown): Promise<{ stored_count: number }> {
    const parsed = messagingWebhookCallbackDto.safeParse(body);
    if (!parsed.success) throw new ValidationError('errors:messagingWebhookBodyInvalid');
    const byAccount = new Map<string, MessagingWebhookUpdate[]>();
    for (const update of extractMessagingWebhookUpdates(parsed.data)) {
      const key = `${update.channel}:${update.accountId}`;
      byAccount.set(key, [...(byAccount.get(key) ?? []), update]);
    }
    let storedCount = 0;
    for (const updates of byAccount.values()) {
      const { channel, accountId } = updates[0]!;
      const organizationPublicId = await this.repository.resolveOrganizationPublicId({
        channel,
        accountId,
      });
      if (organizationPublicId === null) {
        logger.warn(
          { channel, accountId, count: updates.length },
          'messaging-webhook.account_unknown',
        );
        continue;
      }
      storedCount += await withAppDatabaseContext({
        scope: PRINCIPAL_SCOPE.VERIFIED({ organizationPublicId }),
        callback: () => this.repository.insertUpdates({ organizationPublicId, updates }),
      });
      await requestMessagingWebhookEventProcessing(organizationPublicId);
    }
    return { stored_count: storedCount };
  }
}
