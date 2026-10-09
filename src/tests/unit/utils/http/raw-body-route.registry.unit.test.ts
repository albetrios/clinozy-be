import { describe, expect, it } from 'vitest';
import {
  listRawBodyRoutes,
  registerRawBodyRoute,
  shouldCaptureRawBody,
} from '@/shared/utils/http/raw-body-route.registry.js';

/**
 * The registry the content-type parser reads to keep a signed webhook's raw body — Stripe and
 * Meta signature verification cannot work without it.
 *
 * The map is deliberately process-global (the webhook routes modules fill it at registration time
 * and the content-type parser in `src/app.ts` reads it per request), so every case below uses a
 * unique sentinel URL and asserts membership rather than exact set equality — a suite that also
 * builds the app would otherwise see the real webhook URLs in the same map.
 */
describe('raw-body-route.registry', () => {
  it('captures a registered URL that carries its signature header', () => {
    const url = '/api/v1/billing/webhook-registry-positive';
    registerRawBodyRoute({ url, signatureHeader: 'Stripe-Signature' });

    expect(shouldCaptureRawBody({ url, headers: { 'stripe-signature': 't=1,v1=x' } })).toBe(true);
    expect(
      shouldCaptureRawBody({ url: `${url}?a=1`, headers: { 'stripe-signature': 't=1' } }),
    ).toBe(true);
  });

  it('does not capture a registered URL without its signature header, or with another one', () => {
    const url = '/api/v1/app/messaging-webhook-registry-header';
    registerRawBodyRoute({ url, signatureHeader: 'x-hub-signature-256' });

    expect(shouldCaptureRawBody({ url, headers: {} })).toBe(false);
    expect(shouldCaptureRawBody({ url, headers: { 'stripe-signature': 't=1' } })).toBe(false);
    expect(shouldCaptureRawBody({ url, headers: { 'x-hub-signature-256': 'sha256=ab' } })).toBe(
      true,
    );
  });

  it('does not capture a URL that was never registered', () => {
    // The whole point of the registry: anything not explicitly declared with
    // `config.captureRawBody = true` must NOT have its body buffered.
    const url = '/api/v1/billing/webhook-registry-never-registered';
    expect(shouldCaptureRawBody({ url, headers: { 'stripe-signature': 't=1' } })).toBe(false);
  });

  it('lists the registered URLs, once each', () => {
    const url = '/api/v1/billing/webhook-registry-listed';
    registerRawBodyRoute({ url, signatureHeader: 'stripe-signature' });
    registerRawBodyRoute({ url, signatureHeader: 'stripe-signature' });

    expect(listRawBodyRoutes().filter((entry) => entry === url)).toHaveLength(1);
  });

  it('does NOT match a near-miss URL (trailing slash or different prefix)', () => {
    // Matching is exact, not prefix/normalizing. A near-miss must fail closed: the raw body is not
    // captured, so verification rejects rather than checking a re-serialized (byte-shifted) body.
    const url = '/api/v1/billing/webhook-registry-exact';
    const headers = { 'stripe-signature': 't=1' };
    registerRawBodyRoute({ url, signatureHeader: 'stripe-signature' });

    expect(shouldCaptureRawBody({ url: `${url}/`, headers })).toBe(false);
    expect(shouldCaptureRawBody({ url: '/billing/webhook-registry-exact', headers })).toBe(false);
    expect(shouldCaptureRawBody({ url: url.toUpperCase(), headers })).toBe(false);
  });
});
