/**
 * Policy: Stripe webhook HTTP ingress must register stripeWebhookIngressPlugin before
 * the webhook route.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = process.cwd();
const BILLING_DOMAIN_ROOT = join(PROJECT_ROOT, 'src/domains/billing');
const STRIPE_WEBHOOK_ROUTES = join(
  BILLING_DOMAIN_ROOT,
  'sub-domains/stripe-webhook/stripe-webhook.routes.ts',
);

describe('Stripe webhook ingress policy', () => {
  it('registers stripeWebhookIngressPlugin before the webhook route', () => {
    const source = readFileSync(STRIPE_WEBHOOK_ROUTES, 'utf8');

    expect(source).toContain('stripeWebhookIngressPlugin');

    // Patterns tolerate Biome line-wrapping of `.post(` arguments when the
    // schema block is large enough to force multi-line formatting.
    const ingressIndex = source.search(/await\s+stripeWebhookIngressPlugin\s*\(\s*app/);
    const postIndex = source.search(/zodApplication\.post\(\s*['"]\/webhook['"]/);

    expect(ingressIndex).toBeGreaterThanOrEqual(0);
    expect(postIndex).toBeGreaterThan(ingressIndex);
  });

  it('preserves webhook rate-limit config alongside raw-body capture', () => {
    const source = readFileSync(STRIPE_WEBHOOK_ROUTES, 'utf8');

    expect(source).toContain('...WEBHOOK_RATE_LIMIT.config');
    expect(source).toContain('captureRawBody: true');
  });
});
