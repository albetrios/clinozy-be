import { describe, expect, it } from 'vitest';
import { webhookSubscribesToEvent } from '@/domains/notify/sub-domains/webhook/webhook-subscription.util.js';

describe('webhookSubscribesToEvent', () => {
  it('returns true when event type is in the list', () => {
    expect(
      webhookSubscribesToEvent({
        events: ['billing.subscription.updated', 'user.created'],
        event_type: 'billing.subscription.updated',
      }),
    ).toBe(true);
  });

  it('returns false when event type is missing or events is not an array', () => {
    expect(
      webhookSubscribesToEvent({
        events: ['user.created'],
        event_type: 'billing.subscription.updated',
      }),
    ).toBe(false);
    expect(
      webhookSubscribesToEvent({ events: null, event_type: 'billing.subscription.updated' }),
    ).toBe(false);
  });
});
