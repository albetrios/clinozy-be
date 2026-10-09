import { describe, expect, it } from 'vitest';
import {
  isConfirmationReply,
  isStartReply,
  isStopReply,
} from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.replies.js';

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

/** D32, Meta's opt-out policy: the whole reply is the word — never inside a sentence. */
describe('isStopReply / isStartReply', () => {
  it.each([
    'STOP',
    'stop',
    'Stop.',
    ' STOP ALL ',
    'Stop messages',
    'UNSUBSCRIBE',
    'opt-out',
    'OptOut',
  ])('stops on %j', (text) => {
    expect(isStopReply(text)).toBe(true);
    expect(isStartReply(text)).toBe(false);
  });

  it.each(["please don't stop the treatment", 'stop by tomorrow?', 'cancel', 'no', '', 'STOPPED'])(
    'does not stop on %j',
    (text) => {
      expect(isStopReply(text)).toBe(false);
    },
  );

  it.each(['START', 'start', 'Unstop', 'resume', 'opt in'])('starts again on %j', (text) => {
    expect(isStartReply(text)).toBe(true);
    expect(isStopReply(text)).toBe(false);
  });

  it('a stop word is not a confirmation, and a yes is neither', () => {
    expect(isConfirmationReply('STOP')).toBe(false);
    expect([isStopReply('yes'), isStartReply('yes')]).toEqual([false, false]);
  });
});
