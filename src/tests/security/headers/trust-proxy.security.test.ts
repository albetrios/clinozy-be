import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

/**
 * Trust proxy — IP must not be spoofable unless TRUST_PROXY is enabled.
 */
describe('Security: trust proxy', () => {
  let application: FastifyInstance | undefined;

  afterEach(async () => {
    if (application) {
      await application.close();
      application = undefined;
    }
  });

  it('without trustProxy ignores X-Forwarded-For and uses the socket address', async () => {
    application = Fastify({ trustProxy: false });
    application.get('/ip', async (request) => ({ ip: request.ip }));
    await application.ready();

    const response = await application.inject({
      method: 'GET',
      url: '/ip',
      headers: { 'x-forwarded-for': '203.0.113.1' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { ip: string };
    expect(body.ip).not.toBe('203.0.113.1');
    expect(body.ip).toBeTruthy();
  });

  it('with trustProxy=1 respects X-Forwarded-For at one hop', async () => {
    // fastify@5.12 removed `number` from the trustProxy type — the equivalent
    // one-hop predicate (what resolveTrustProxy now compiles env numbers to).
    application = Fastify({ trustProxy: (_address, hopIndex) => hopIndex < 1 });
    application.get('/ip', async (request) => ({ ip: request.ip }));
    await application.ready();

    const response = await application.inject({
      method: 'GET',
      url: '/ip',
      headers: { 'x-forwarded-for': '203.0.113.1' },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { ip: string }).ip).toBe('203.0.113.1');
  });

  // D-6: with a hop count, any peer is trusted, so a client that reaches the app directly sets
  // its own X-Forwarded-For. With an address list (TRUST_PROXY=<CIDR>), only a listed proxy is.
  it('with a proxy address list ignores X-Forwarded-For from a peer outside it', async () => {
    application = Fastify({ trustProxy: ['10.0.0.0/8'] });
    application.get('/ip', async (request) => ({ ip: request.ip }));
    await application.ready();

    const response = await application.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: '198.51.100.9',
      headers: { 'x-forwarded-for': '203.0.113.1' },
    });

    expect((response.json() as { ip: string }).ip).toBe('198.51.100.9');
  });

  it('with a proxy address list honours X-Forwarded-For from a listed proxy', async () => {
    application = Fastify({ trustProxy: ['10.0.0.0/8'] });
    application.get('/ip', async (request) => ({ ip: request.ip }));
    await application.ready();

    const response = await application.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: '10.1.2.3',
      headers: { 'x-forwarded-for': '203.0.113.1' },
    });

    expect((response.json() as { ip: string }).ip).toBe('203.0.113.1');
  });
});
