import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import {
  injectAuthenticated,
  injectUnauthenticated,
} from '@/tests/helpers/test-http-inject.helper.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';

/**
 * G2-7 — patient and account responses are never stored by a browser, proxy or CDN.
 *
 * They carried no `Cache-Control` at all, so a shared proxy or the browser's disk cache could keep
 * a patient file after sign-out. Every `/api/v1/app/*` and `/api/v1/users/me*` response, and any
 * other authenticated one whose route sets no caching of its own, now says `no-store`.
 */
describe('Security: private responses carry Cache-Control: no-store (G2-7)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = (await createTestApp()).app;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('marks the caller account no-store', async () => {
    const user = await createTestUser();
    const token = await generateTestToken({ userId: user.public_id });

    const response = await injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath('/users/me'),
      token,
    });

    expect(response.statusCode).toBe(200);
    // The account body carries an email, so the stricter secret-body directive applies; both
    // forbid storing it.
    expect(response.headers['cache-control']).toMatch(/^no-store,.*private$/);
  });

  it('marks a clinic-room response no-store even when it is a refusal', async () => {
    const response = await injectUnauthenticated(app, {
      method: 'GET',
      url: testApiPath('/app/patients'),
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store, private');
  });
});
