import { describe, expect, it } from 'vitest';
import { isConfirmationReply } from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.replies.js';

/** WC-8 (launch D78): which WhatsApp replies confirm a booking — "Reply YES to confirm". */
describe('isConfirmationReply', () => {
  it.each([
    'YES',
    'yes',
    'Yes 👍',
    'y',
    'Yes, see you then',
    'ok see you',
    'Confirmed!',
    'yeah sure',
  ])('confirms %j', (text) => {
    expect(isConfirmationReply(text)).toBe(true);
  });

  it.each([
    '',
    '👍',
    'no',
    'yes but can we move it',
    'Yes I cannot come',
    "yes I can't make it",
    'please reschedule',
    'yes yes yes yes yes yes',
    'see you tomorrow, yes',
  ])('does not confirm %j', (text) => {
    expect(isConfirmationReply(text)).toBe(false);
  });
});
