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

const ALLOWED_ORIGIN = 'http://localhost:3000';

function sessionCookiePair(headers: {
  'set-cookie'?: string | string[] | number | undefined;
}): string {
  const raw = headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const sessionCookie = cookies.find((cookie) => cookie.startsWith('session_id='));
  expect(sessionCookie).toBeDefined();
  return String(sessionCookie).split(';')[0]!.trim();
}

describe('refresh-token reuse detection only acts on issued secrets', () => {
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

  async function login(email: string, password: string) {
    const response = await injectUnauthenticated(application, {
      method: 'POST',
      url: testApiPath('/auth/login'),
      payload: { email, password },
    });
    expect(response.statusCode).toBe(200);
    return {
      accessToken: (response.json() as { data: { access_token: string } }).data.access_token,
      cookie: sessionCookiePair(response.headers),
    };
  }

  function refresh(cookie: string) {
    return application.inject({
      method: 'POST',
      url: testApiPath('/auth/refresh'),
      headers: { cookie, origin: ALLOWED_ORIGIN },
      payload: {},
    });
  }

  it('a stolen bearer cannot log the user out everywhere with a made-up secret', async () => {
    const { user, password } = await createTestUserWithPassword();
    const attackerHeld = await login(user.email, password);
    const victimDevice = await login(user.email, password);

    // The stolen bearer can list session ids — but holds no refresh secret.
    const sessionsResponse = await injectAuthenticated(application, {
      method: 'GET',
      url: testApiPath('/auth/me/sessions'),
      token: attackerHeld.accessToken,
    });
    expect(sessionsResponse.statusCode).toBe(200);
    const victimSessionId = victimDevice.cookie.slice('session_id='.length).split('.')[0]!;
    const listed = (sessionsResponse.json() as { data: Array<{ id: string }> }).data;
    expect(listed.map((session) => session.id)).toContain(victimSessionId);

    for (const fabricated of ['made-up-secret', 'made-up~not-a-real-mac']) {
      const forged = await refresh(`session_id=${victimSessionId}.${fabricated}`);
      expect(forged.statusCode).toBe(401);
    }

    // Nothing was revoked: both sessions still work.
    const meStillWorks = await injectAuthenticated(application, {
      method: 'GET',
      url: testApiPath('/users/me'),
      token: attackerHeld.accessToken,
    });
    expect(meStillWorks.statusCode).toBe(200);
    const victimRefresh = await refresh(victimDevice.cookie);
    expect(victimRefresh.statusCode).toBe(200);
  });

  it('replaying an issued, retired secret still revokes the whole session family', async () => {
    const { user, password } = await createTestUserWithPassword();
    const device = await login(user.email, password);
    const otherDevice = await login(user.email, password);

    // Rotate twice: the first secret is now neither current nor the grace-window previous one.
    const firstRotation = await refresh(device.cookie);
    expect(firstRotation.statusCode).toBe(200);
    const secondRotation = await refresh(sessionCookiePair(firstRotation.headers));
    expect(secondRotation.statusCode).toBe(200);
    const newestCookie = sessionCookiePair(secondRotation.headers);

    const replay = await refresh(device.cookie);
    expect(replay.statusCode).toBe(401);

    // The issued secret proved a replay: every session of the user is gone.
    expect((await refresh(newestCookie)).statusCode).toBe(401);
    const otherDeviceMe = await injectAuthenticated(application, {
      method: 'GET',
      url: testApiPath('/users/me'),
      token: otherDevice.accessToken,
    });
    expect(otherDeviceMe.statusCode).toBe(401);
  });
});
