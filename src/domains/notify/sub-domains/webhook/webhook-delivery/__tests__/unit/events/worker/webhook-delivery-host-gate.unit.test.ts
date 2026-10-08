import { describe, expect, it } from 'vitest';
import { webhookDeliveryDestinationHost } from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery-host-gate.js';

describe('webhookDeliveryDestinationHost', () => {
  it('lowercases the host and includes the port, filling the scheme default when it is omitted', () => {
    expect(webhookDeliveryDestinationHost('https://Example.COM/hook')).toBe('example.com:443');
    expect(webhookDeliveryDestinationHost('https://Example.COM:8443/hook')).toBe(
      'example.com:8443',
    );
    expect(webhookDeliveryDestinationHost('http://Example.COM/hook')).toBe('example.com:80');
    expect(webhookDeliveryDestinationHost('https://[::1]/hook')).toBe('[::1]:443');
  });

  it('returns null when the URL cannot be parsed', () => {
    expect(webhookDeliveryDestinationHost('not a url')).toBeNull();
  });
});
