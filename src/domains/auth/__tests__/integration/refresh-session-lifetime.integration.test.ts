import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import {
  injectAuthenticated,
  injectUnauthenticated,
} from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { createTestUserWithPassword } from '@/tests/factories/user.factory.js';
import { sessions } from '@/domains/auth/sub-domains/auth-session/auth-session.schema.js';

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

/**
 * E-2 — the server, not the browser, ends an idle or old session. Before this, refresh checked
 * only the 7-day `expires_at`: a closed laptop's cookie refreshed for a week and the 30-minute idle
 * sign-out existed only in clinozy-fe. The two refusals carry the `error.reason` clinozy-fe reads.
 */
describe('POST /auth/refresh — idle timeout and absolute lifetime (E-2)', () => {
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

  async function login(): Promise<{
    cookie: string;
    sessionPublicId: string;
    accessToken: string;
  }> {
    const { user, password } = await createTestUserWithPassword();
    const response = await injectUnauthenticated(application, {
      method: 'POST',
      url: testApiPath('/auth/login'),
      payload: { email: user.email, password },
    });
    expect(response.statusCode).toBe(200);
    const cookie = sessionCookiePair(response.headers);
    return {
      cookie,
      sessionPublicId: cookie.slice('session_id='.length).split('.')[0]!,
      accessToken: (response.json() as { data: { access_token: string } }).data.access_token,
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

  /** Moves the session's clocks back — `created_at` first, so `last_active_at >= created_at` holds. */
  async function backdateSession(options: {
    sessionPublicId: string;
    createdMinutesAgo: number;
    lastActiveMinutesAgo: number;
  }): Promise<void> {
    await getOperatorDatabase()
      .update(sessions)
      .set({
        created_at: sql`now() - make_interval(mins => ${options.createdMinutesAgo})`,
        last_active_at: sql`now() - make_interval(mins => ${options.lastActiveMinutesAgo})`,
      })
      .where(eq(sessions.public_id, options.sessionPublicId));
  }

  async function readSession(sessionPublicId: string) {
    const [row] = await getOperatorDatabase()
      .select({ is_revoked: sessions.is_revoked, last_active_at: sessions.last_active_at })
      .from(sessions)
      .where(eq(sessions.public_id, sessionPublicId))
      .limit(1);
    return row;
  }

  it('refuses a session idle for 31 minutes with 401 idle_timeout and revokes it', async () => {
    const { cookie, sessionPublicId } = await login();
    await backdateSession({ sessionPublicId, createdMinutesAgo: 32, lastActiveMinutesAgo: 31 });

    const response = await refresh(cookie);

    expect(response.statusCode).toBe(401);
    const body = response.json() as { error?: { reason?: string } };
    expect(body.error?.reason).toBe('idle_timeout');
    expect((await readSession(sessionPublicId))?.is_revoked).toBe(true);
  });

  it('refuses a session older than 12 hours with 401 session_expired, however active, and revokes it', async () => {
    const { cookie, sessionPublicId } = await login();
    await backdateSession({
      sessionPublicId,
      createdMinutesAgo: 12 * 60 + 1,
      lastActiveMinutesAgo: 1,
    });

    const response = await refresh(cookie);

    expect(response.statusCode).toBe(401);
    const body = response.json() as { error?: { reason?: string } };
    expect(body.error?.reason).toBe('session_expired');
    expect((await readSession(sessionPublicId))?.is_revoked).toBe(true);
  });

  it('refreshes a fresh session and moves last_active_at forward', async () => {
    const { cookie, sessionPublicId } = await login();
    await backdateSession({ sessionPublicId, createdMinutesAgo: 20, lastActiveMinutesAgo: 20 });
    const before = (await readSession(sessionPublicId))?.last_active_at;

    const response = await refresh(cookie);

    expect(response.statusCode).toBe(200);
    const after = (await readSession(sessionPublicId))?.last_active_at;
    expect(before).toBeInstanceOf(Date);
    expect(after).toBeInstanceOf(Date);
    expect(after!.getTime()).toBeGreaterThan(before!.getTime() + 19 * 60 * 1000);
  });

  it('an authenticated request moves last_active_at too, so idle means no request at all', async () => {
    const { sessionPublicId, accessToken } = await login();
    await backdateSession({ sessionPublicId, createdMinutesAgo: 20, lastActiveMinutesAgo: 20 });
    const before = (await readSession(sessionPublicId))?.last_active_at;

    const response = await injectAuthenticated(application, {
      method: 'GET',
      url: testApiPath('/users/me'),
      token: accessToken,
    });

    expect(response.statusCode).toBe(200);
    const after = (await readSession(sessionPublicId))?.last_active_at;
    expect(after!.getTime()).toBeGreaterThan(before!.getTime() + 19 * 60 * 1000);
  });

  it('sets the session cookie without Max-Age or Expires (a browser-session cookie)', async () => {
    const { cookie } = await login();
    const response = await refresh(cookie);
    expect(response.statusCode).toBe(200);
    const raw = response.headers['set-cookie'];
    const cookies = Array.isArray(raw) ? raw : [String(raw)];
    const sessionCookie = cookies.find((candidate) => candidate.startsWith('session_id='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie!.toLowerCase()).not.toContain('max-age=');
    expect(sessionCookie!.toLowerCase()).not.toContain('expires=');
  });
});
