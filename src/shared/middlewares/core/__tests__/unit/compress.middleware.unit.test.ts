import { describe, it, expect } from 'vitest';
import fastify from 'fastify';
import compressMiddleware from '@/shared/middlewares/core/compress.middleware.js';

/**
 * Build a Fastify app with the compress middleware registered and a single
 * route that returns a long JSON body containing a sensitive field name.
 * The body must be > 1 KB so it exceeds the compression threshold and
 * `@fastify/compress` would otherwise gzip it.
 */
async function buildAppWithSecretRoute(secretValue: string) {
  const app = fastify();
  await app.register(compressMiddleware);
  app.get('/with-secret', async () => {
    const padding = 'x'.repeat(2048);
    return {
      raw_key: secretValue,
      message: `ok ${padding}`,
    };
  });
  app.get('/no-secret', async () => {
    const padding = 'y'.repeat(2048);
    return { message: `plain ${padding}` };
  });
  return app;
}

describe('compress.middleware — sec-re-03: BREACH suppression', () => {
  it('returns Content-Encoding: identity-no-compress when the body contains a sensitive field name', async () => {
    // sec-re-03: the prior fix tried `reply.header('x-no-compression', '1')` —
    // a *response* header. `@fastify/compress` reads the *request* header of
    // that name and silently ignored it, so the BREACH side-channel stayed
    // open. The reliable mechanism is `content-encoding: identity-no-compress`
    // which short-circuits compress's encoding check.
    const app = await buildAppWithSecretRoute('super-secret-value');
    const response = await app.inject({
      method: 'GET',
      url: '/with-secret',
      headers: { 'accept-encoding': 'gzip, br' },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-encoding']).toBe('identity-no-compress');
  });

  it('returns the raw JSON body unencoded (first byte is "{", NOT 0x1f 0x8b gzip magic)', async () => {
    const app = await buildAppWithSecretRoute('another-secret');
    const response = await app.inject({
      method: 'GET',
      url: '/with-secret',
      headers: { 'accept-encoding': 'gzip, br' },
    });
    await app.close();

    // gzip magic bytes are 0x1f 0x8b. A non-compressed JSON body starts with '{'.
    const rawBuffer = response.rawPayload;
    expect(rawBuffer[0]).toBe(0x7b);
    expect(rawBuffer[0]).not.toBe(0x1f);

    // And the secret is intact in the body.
    expect(response.body).toContain('another-secret');
  });

  it('sets cache-control no-store on the secret-bearing response', async () => {
    const app = await buildAppWithSecretRoute('cache-probe');
    const response = await app.inject({
      method: 'GET',
      url: '/with-secret',
      headers: { 'accept-encoding': 'gzip' },
    });
    await app.close();

    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.headers['cache-control']).toContain('private');
  });

  it('does NOT alter responses that lack sensitive field names', async () => {
    // The hook must only engage when the body matches the secret-fingerprint
    // matcher. Plain routes still get compressed by fastify-compress.
    const app = await buildAppWithSecretRoute('unused');
    const response = await app.inject({
      method: 'GET',
      url: '/no-secret',
      headers: { 'accept-encoding': 'gzip' },
    });
    await app.close();

    expect(response.headers['content-encoding']).not.toBe('identity-no-compress');
  });

  // Regression guard: an earlier fast-path scanned for quoted fragments (`"token"`, `"raw_key"`)
  // and silently MISSED access_token / email / session_id / client_secret, leaving secret-bearing
  // bodies compressible. The pre-scan must stay a superset of the canonical secret matcher.
  it.each(['access_token', 'email', 'session_id', 'client_secret'])(
    'engages the BREACH suppression for the previously-missed field %s',
    async (field) => {
      const app = fastify();
      await app.register(compressMiddleware);
      app.get('/probe', async () => ({ [field]: 'sensitive', message: `ok ${'x'.repeat(2048)}` }));
      const response = await app.inject({
        method: 'GET',
        url: '/probe',
        headers: { 'accept-encoding': 'gzip, br' },
      });
      await app.close();

      expect(response.headers['content-encoding']).toBe('identity-no-compress');
    },
  );
});

describe('compress.middleware — C-5: signed patient media URLs are secrets', () => {
  it.each(['file_url', 'thumbnail_url'])(
    'marks a body carrying %s no-store and uncompressed',
    async (field) => {
      const app = fastify();
      await app.register(compressMiddleware);
      app.get('/photo', async () => ({
        data: { [field]: 'https://bucket.s3/key?X-Amz-Signature=abc', note: 'x'.repeat(2048) },
      }));
      const response = await app.inject({
        method: 'GET',
        url: '/photo',
        headers: { 'accept-encoding': 'gzip, br' },
      });
      await app.close();

      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.headers['content-encoding']).toBe('identity-no-compress');
    },
  );
});

describe('compress.middleware — G2-7: private responses are never stored', () => {
  async function buildApp() {
    const app = fastify();
    app.decorateRequest('auth', null);
    // Stands in for `authenticate`: a request with `x-test-auth` is an authenticated one.
    app.addHook('onRequest', async (request) => {
      if (request.headers['x-test-auth']) {
        (request as { auth: unknown }).auth = { kind: 'user', userId: 'user_public' };
      }
    });
    await app.register(compressMiddleware);
    app.get('/api/v1/app/patients/:patient_id', async () => ({ data: { name: 'A patient' } }));
    app.get('/api/v1/users/me', async () => ({ data: { display_name: 'Me' } }));
    app.get('/api/v1/users/me/settings', async () => ({ data: { theme: 'dark' } }));
    app.get('/api/v1/tenancy/organization', async () => ({ data: { name: 'Clinic' } }));
    app.get('/api/v1/tenancy/permissions', async (_request, reply) => {
      reply.header('cache-control', 'public, max-age=300');
      return { data: [] };
    });
    app.get('/api/v1/billing/plans', async () => ({ data: [] }));
    await app.ready();
    return app;
  }

  it.each([
    '/api/v1/app/patients/pat_000000000000000000001',
    '/api/v1/app/patients/pat_000000000000000000001?include=notes',
    '/api/v1/users/me',
    '/api/v1/users/me/settings',
    '/api/v1/app/no-such-room',
  ])('answers %s with Cache-Control: no-store, whatever its status', async (url) => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url });
    await app.close();

    expect(response.headers['cache-control']).toBe('no-store, private');
  });

  it('marks any other authenticated response no-store', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tenancy/organization',
      headers: { 'x-test-auth': '1' },
    });
    await app.close();

    expect(response.headers['cache-control']).toBe('no-store, private');
  });

  it("keeps an authenticated route's own Cache-Control, and leaves public responses alone", async () => {
    const app = await buildApp();
    const catalog = await app.inject({
      method: 'GET',
      url: '/api/v1/tenancy/permissions',
      headers: { 'x-test-auth': '1' },
    });
    const publicPlans = await app.inject({ method: 'GET', url: '/api/v1/billing/plans' });
    await app.close();

    expect(catalog.headers['cache-control']).toBe('public, max-age=300');
    expect(publicPlans.headers['cache-control']).toBeUndefined();
  });

  it('does not take /users/meetings for the caller account', async () => {
    const app = fastify();
    await app.register(compressMiddleware);
    app.get('/api/v1/users/meetings', async () => ({ data: [] }));
    const response = await app.inject({ method: 'GET', url: '/api/v1/users/meetings' });
    await app.close();

    expect(response.headers['cache-control']).toBeUndefined();
  });
});

describe('compress.middleware — audit #4: inbound decompression disabled', () => {
  it('does NOT inflate a gzip-encoded request body (no CPU-amplification surface)', async () => {
    const { gzipSync } = await import('node:zlib');
    const app = fastify();
    await app.register(compressMiddleware);
    app.post('/echo', async (request) => request.body);

    const compressedBody = gzipSync(Buffer.from(JSON.stringify({ hello: 'world' })));
    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
      payload: compressedBody,
    });
    await app.close();

    // With globalDecompression:false the gzip bytes are NOT inflated, so the JSON parser
    // cannot read the original object — the request is rejected rather than silently inflated.
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});
