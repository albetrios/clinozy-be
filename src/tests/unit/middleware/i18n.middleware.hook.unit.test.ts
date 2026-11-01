import Fastify, { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import i18next from 'i18next';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import i18nMiddleware from '@/shared/middlewares/core/i18n.middleware.js';
import { SUPPORTED_LANGUAGES } from '@/shared/constants/i18n.constants.js';

/**
 * D-1 — the language a request names must never grow what i18next loads.
 *
 * The middleware used to run `i18next-http-middleware`'s handler, which took any `?lng=`,
 * `i18next` cookie or `Accept-Language` value, cloned the instance and called `loadLanguages`
 * with it: every new code was appended to `i18next.options.preload` for good and the whole list
 * reloaded, so a stream of anonymous requests with random codes wedged the event loop. These run
 * against the real i18next singleton and the real locale files.
 */
describe('i18n.middleware (onRequest hook)', () => {
  let application: FastifyInstance;

  function loadedLanguages(): string[] {
    return Object.keys(i18next.store.data).sort();
  }

  beforeAll(async () => {
    application = Fastify({ logger: false });
    await application.register(fp(i18nMiddleware, { name: 'i18n-middleware-hook-test' }));
    application.get('/probe', async (request) => ({
      language: request.language ?? null,
      translated: request.t?.('errors:routeNotFound') ?? null,
    }));
    await application.ready();
  });

  afterAll(async () => {
    await application.close();
  });

  it('answers in the supported language the request asks for', async () => {
    const response = await application.inject({
      method: 'GET',
      url: '/probe',
      headers: { 'accept-language': 'es-ES,es;q=0.9' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-language']).toBe('es');
    expect(response.json()).toEqual({ language: 'es', translated: 'Ruta no encontrada' });
  });

  it('answers in English when the request names no language', async () => {
    const response = await application.inject({ method: 'GET', url: '/probe' });
    expect(response.headers['content-language']).toBe('en');
    expect(response.json()).toEqual({ language: 'en', translated: 'Route not found' });
  });

  it.each([
    ['a ?lng= query', { url: '/probe?lng=zz-audit' }],
    ['an i18next cookie', { url: '/probe', headers: { cookie: 'i18next=zz-cookie' } }],
    ['an Accept-Language header', { url: '/probe', headers: { 'accept-language': 'zz-header' } }],
    [
      'a region of a supported language',
      { url: '/probe', headers: { 'accept-language': 'es-ZZ' } },
    ],
  ])('leaves i18next untouched for an unknown code in %s', async (_label, request) => {
    const preloadBefore = [...(i18next.options.preload as readonly string[])];
    const loadedBefore = loadedLanguages();

    const response = await application.inject({ method: 'GET', ...request });

    expect(response.statusCode).toBe(200);
    expect(SUPPORTED_LANGUAGES).toContain(response.headers['content-language']);
    expect(i18next.options.preload).toEqual(preloadBefore);
    expect(loadedLanguages()).toEqual(loadedBefore);
  });

  it('keeps the preload list fixed across many random codes', async () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const code = `x${attempt.toString(36)}-audit`;
      await application.inject({
        method: 'GET',
        url: `/probe?lng=${code}`,
        headers: { 'accept-language': code, cookie: `i18next=${code}` },
      });
    }
    expect([...(i18next.options.preload as readonly string[])].sort()).toEqual(
      [...SUPPORTED_LANGUAGES].sort(),
    );
    expect(loadedLanguages()).toEqual([...SUPPORTED_LANGUAGES].sort());
  });
});
