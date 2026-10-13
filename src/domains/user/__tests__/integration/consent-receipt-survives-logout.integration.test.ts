import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import {
  injectAuthenticated,
  injectUnauthenticated,
} from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUserWithPassword } from '@/tests/factories/user.factory.js';

/**
 * Iteration change-cookie-consent-2026-10-13-fmal (CC1–CC4): the browser owns the cookie answer
 * (claude.com's model), and the account keeps a receipt of answers given while signed in. Signing
 * out must leave that receipt exactly as it was and must not touch the browser's own answer — no
 * `Clear-Site-Data`, no consent cookie — so the card never comes back after a sign-out.
 */
describe('the analytics consent receipt across sign-out', () => {
  let application: FastifyInstance;

  beforeAll(async () => {
    const { app: testApplication } = await createTestApp();
    application = testApplication;
  });

  afterAll(async () => {
    await application.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  async function signIn(email: string, password: string): Promise<string> {
    const response = await injectUnauthenticated(application, {
      method: 'POST',
      url: testApiPath('/auth/login'),
      payload: { email, password },
    });
    expect(response.statusCode, response.body).toBe(200);
    return (response.json() as { data: { access_token: string } }).data.access_token;
  }

  it('sign in → record a receipt (policy version 2) → sign out → sign in: the receipt is unchanged', async () => {
    const { user, password } = await createTestUserWithPassword();
    const firstToken = await signIn(user.email, password);

    const recorded = await injectAuthenticated(application, {
      method: 'PATCH',
      url: testApiPath('/users/me/settings'),
      token: firstToken,
      payload: { analytics_consent: 'granted', analytics_consent_version: 2 },
    });
    expect(recorded.statusCode, recorded.body).toBe(200);
    const receipt = (recorded.json() as { data: Record<string, unknown> }).data;
    expect(receipt).toMatchObject({ analytics_consent: 'granted', analytics_consent_version: 2 });
    expect(receipt.analytics_consent_at).toEqual(expect.any(String));

    const signedOut = await injectAuthenticated(application, {
      method: 'POST',
      url: testApiPath('/auth/logout'),
      token: firstToken,
    });
    expect(signedOut.statusCode, signedOut.body).toBe(200);
    // The browser's own answer is the frontend's cookie: sign-out neither wipes the site's
    // storage nor sets or expires any consent cookie.
    expect(signedOut.headers['clear-site-data']).toBeUndefined();
    const setCookies = [signedOut.headers['set-cookie'] ?? []].flat();
    expect(setCookies.filter((cookie) => /consent/i.test(String(cookie)))).toEqual([]);

    const secondToken = await signIn(user.email, password);
    const read = await injectAuthenticated(application, {
      method: 'GET',
      url: testApiPath('/users/me/settings'),
      token: secondToken,
    });
    expect(read.statusCode, read.body).toBe(200);
    expect((read.json() as { data: Record<string, unknown> }).data).toMatchObject({
      analytics_consent: 'granted',
      analytics_consent_version: 2,
      analytics_consent_at: receipt.analytics_consent_at,
    });
  });
});
