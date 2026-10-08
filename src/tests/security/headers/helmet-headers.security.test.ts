import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { injectUnauthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import type { FastifyInstance } from 'fastify';

/**
 * Helmet / security headers tests — verify HTTP security headers are set.
 */
describe('Security: Helmet Headers', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets the required X-Content-Type-Options header', async () => {
    const response = await injectUnauthenticated(app, {
      method: 'GET',
      url: '/livez',
    });
    const value =
      response.headers['x-content-type-options'] ?? response.headers['X-Content-Type-Options'];
    expect(value).toBe('nosniff');
  });

  it('should set X-Frame-Options header', async () => {
    const response = await injectUnauthenticated(app, {
      method: 'GET',
      url: '/livez',
    });
    const frameOptions = response.headers['x-frame-options'];
    expect(frameOptions).toBe('SAMEORIGIN');
  });

  it('should set Referrer-Policy header', async () => {
    const response = await injectUnauthenticated(app, {
      method: 'GET',
      url: '/livez',
    });
    const referrerPolicy = response.headers['referrer-policy'];
    expect(referrerPolicy).toBe('strict-origin-when-cross-origin');
  });

  it('should set Strict-Transport-Security header', async () => {
    const response = await injectUnauthenticated(app, {
      method: 'GET',
      url: '/livez',
    });
    const hsts = response.headers['strict-transport-security'];
    expect(hsts).toMatch(/^max-age=31536000(?:;|$)/);
  });

  it('sets all configured core browser security policies', async () => {
    const response = await injectUnauthenticated(app, {
      method: 'GET',
      url: '/livez',
    });
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['cross-origin-embedder-policy']).toBe('require-corp');
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  it('should not expose server version', async () => {
    const response = await injectUnauthenticated(app, {
      method: 'GET',
      url: '/livez',
    });
    const server = response.headers.server;
    // Should not reveal "fastify" or version info
    if (server) {
      expect(String(server).toLowerCase()).not.toContain('fastify');
    }
  });
});
