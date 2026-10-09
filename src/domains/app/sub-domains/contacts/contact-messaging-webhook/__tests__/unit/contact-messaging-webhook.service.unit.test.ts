import { describe, expect, it } from 'vitest';
import { messagingWebhookCallbackDto } from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.dto.js';
import { hashMessagingWebhookUpdate } from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.repository.js';
import { extractMessagingWebhookUpdates } from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.service.js';

/** Parses a callback as the route does. */
function callback(body: unknown) {
  return messagingWebhookCallbackDto.parse(body);
}

describe('extractMessagingWebhookUpdates (launch D77)', () => {
  it("takes each WhatsApp `messages` change, with its number's id as the account", () => {
    const updates = extractMessagingWebhookUpdates(
      callback({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba',
            changes: [
              { field: 'messages', value: { metadata: { phone_number_id: '1001' }, statuses: [] } },
              { field: 'account_update', value: { metadata: { phone_number_id: '1001' } } },
              { field: 'messages', value: { messages: [] } },
            ],
          },
        ],
      }),
    );
    expect(updates).toEqual([
      {
        channel: 'whatsapp',
        accountId: '1001',
        payload: { metadata: { phone_number_id: '1001' }, statuses: [] },
      },
    ]);
  });

  it("takes each Instagram `messaging` event, with the entry's account", () => {
    const updates = extractMessagingWebhookUpdates(
      callback({
        object: 'instagram',
        entry: [{ id: '1784', messaging: [{ read: { mid: 'm1' } }, { message: { mid: 'm2' } }] }],
      }),
    );
    expect(updates.map((update) => [update.channel, update.accountId])).toEqual([
      ['instagram', '1784'],
      ['instagram', '1784'],
    ]);
  });

  it('leaves out anything that is not a message (another object)', () => {
    expect(
      extractMessagingWebhookUpdates(
        callback({ object: 'page', entry: [{ id: '1', messaging: [{}] }] }),
      ),
    ).toEqual([]);
  });

  it('hashes an update the same each time, and differently per account', () => {
    const update = { channel: 'whatsapp' as const, accountId: '1001', payload: { a: 1 } };
    expect(hashMessagingWebhookUpdate(update)).toBe(hashMessagingWebhookUpdate({ ...update }));
    expect(hashMessagingWebhookUpdate(update)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashMessagingWebhookUpdate({ ...update, accountId: '1002' })).not.toBe(
      hashMessagingWebhookUpdate(update),
    );
  });
});
