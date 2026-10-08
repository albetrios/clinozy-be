import { describe, expect, it, beforeEach } from 'vitest';
import { WEBHOOK_DELIVERY_PER_HOST_IN_FLIGHT_LIMIT } from '@/infrastructure/outbound/outbound-defaults.js';
import {
  acquireWebhookDeliveryHostSlot,
  releaseWebhookDeliveryHostSlot,
  resetWebhookDeliveryHostSlots,
  webhookDeliveryDestinationHost,
  WebhookDeliveryHostAtCapacity,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery-host-gate.js';

describe('webhook delivery host gate', () => {
  beforeEach(() => {
    resetWebhookDeliveryHostSlots();
  });

  it('reads a lowercased hostname and ignores a URL that cannot be parsed', () => {
    expect(webhookDeliveryDestinationHost('https://Example.COM/hook')).toBe('example.com');
    expect(webhookDeliveryDestinationHost('not a url')).toBeNull();
  });

  it('allows another delivery after a slot is released', () => {
    for (let index = 0; index < WEBHOOK_DELIVERY_PER_HOST_IN_FLIGHT_LIMIT; index++) {
      acquireWebhookDeliveryHostSlot('slow.example');
    }
    expect(() => acquireWebhookDeliveryHostSlot('slow.example')).toThrow(
      WebhookDeliveryHostAtCapacity,
    );
    acquireWebhookDeliveryHostSlot('other.example');

    releaseWebhookDeliveryHostSlot('slow.example');
    expect(() => acquireWebhookDeliveryHostSlot('slow.example')).not.toThrow();
  });
});
