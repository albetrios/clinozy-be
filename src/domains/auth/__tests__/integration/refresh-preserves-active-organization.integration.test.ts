import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { AuthSessionService } from '@/domains/auth/sub-domains/auth-session/auth-session.service.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { MEMBERSHIP_STATUS } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { injectUnauthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUserWithPassword } from '@/tests/factories/user.factory.js';
import {
  provisionPersonalOrganization,
  provisionOrganizationWithOwner,
} from '@/domains/tenancy/sub-domains/organization/organization-provisioning.js';
import { seedAllPermissions } from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';

/**
 * audit-#3: organization switching only re-bound the access-token hash; the
 * selected organization was not persisted on the session, so `/auth/refresh` recomputed
 * the DEFAULT active organization and silently moved the caller off the organization they
 * had switched to. The fix persists the active organization on the session and refresh
 * revalidates + preserves it. These tests drive the real HTTP login → switch →
 * refresh flow and assert the refreshed JWT `org` claim.
 */
describe('refresh preserves the switched active organization (audit-#3)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { app: testApplication } = await createTestApp();
    app = testApplication;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    // Full catalog: provisionOrganizationWithOwner grants billing codes for TEAM organizations.
    await seedAllPermissions();
  });

  function decodeOrgClaim(accessToken: string): string | undefined {
    const payloadSegment = accessToken.split('.')[1]!;
    const json = Buffer.from(payloadSegment, 'base64url').toString('utf8');
    return (JSON.parse(json) as { org?: string }).org;
  }

  function sessionCookie(headers: { 'set-cookie'?: string | string[] }): string {
    const raw = headers['set-cookie'];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const sessionHeader = list.find((cookie) => cookie.startsWith('session_id='));
    expect(sessionHeader).toBeDefined();
    return String(sessionHeader).split(';')[0]!.trim();
  }

  it('refresh keeps the organization claim on the organization the caller switched to', async () => {
    const { user, password } = await createTestUserWithPassword();
    // The personal organization is the only one at login, so it is the login default; the caller
    // then joins TEAM organization B and switches to it. (A clinic that exists at login would be
    // the default itself — a clinic beats the personal workspace.)
    const personal = await provisionPersonalOrganization({ ownerUserId: user.id });

    const loginResponse = await injectUnauthenticated(app, {
      method: 'POST',
      url: testApiPath('/auth/login'),
      payload: { email: user.email, password },
    });
    expect(loginResponse.statusCode).toBe(200);
    const loginToken = (loginResponse.json() as { data: { access_token: string } }).data
      .access_token;
    expect(decodeOrgClaim(loginToken)).toBe(personal.organization.public_id);
    const cookie = sessionCookie(loginResponse.headers);
    const organizationB = await provisionOrganizationWithOwner({
      name: 'Refresh Org B',
      slug: `refresh-organization-b-${generatePublicId('organization').slice(4, 14)}`,
      type: 'TEAM',
      ownerUserId: user.id,
    });

    const switchResponse = await app.inject({
      method: 'POST',
      url: testApiPath('/auth/switch-to-organization'),
      headers: { authorization: `Bearer ${loginToken}` },
      payload: { organization_id: organizationB.organization.public_id },
    });
    expect(switchResponse.statusCode).toBe(200);
    const switchedToken = (switchResponse.json() as { data: { access_token: string } }).data
      .access_token;
    expect(decodeOrgClaim(switchedToken)).toBe(organizationB.organization.public_id);

    const refreshResponse = await app.inject({
      method: 'POST',
      url: testApiPath('/auth/refresh'),
      headers: { cookie, origin: 'http://localhost:3000' },
      payload: {},
    });
    expect(refreshResponse.statusCode).toBe(200);
    const refreshedToken = (refreshResponse.json() as { data: { access_token: string } }).data
      .access_token;

    // The crux of audit-#3: refresh must NOT silently revert to the personal/default organization.
    expect(decodeOrgClaim(refreshedToken)).toBe(organizationB.organization.public_id);
  });

  /*
   * The server keeps one live access token per session. A refresh reads the session, signs a
   * token for the organization it found, then rotates; a switch that commits in between moves
   * the session to another organization. The refresh used to hand back (and make live) a token
   * for the organization the caller had just left, while the session row named the new one.
   */
  it('a switch that commits while a refresh is running leaves the refresh on the switched organization', async () => {
    const { user, password } = await createTestUserWithPassword();
    // Personal is the only organization at login (the login default); B is joined afterwards.
    const personal = await provisionPersonalOrganization({ ownerUserId: user.id });

    const loginResponse = await injectUnauthenticated(app, {
      method: 'POST',
      url: testApiPath('/auth/login'),
      payload: { email: user.email, password },
    });
    expect(loginResponse.statusCode).toBe(200);
    const loginToken = (loginResponse.json() as { data: { access_token: string } }).data
      .access_token;
    expect(decodeOrgClaim(loginToken)).toBe(personal.organization.public_id);
    const cookie = sessionCookie(loginResponse.headers);
    const organizationB = await provisionOrganizationWithOwner({
      name: 'Racing Switch Team',
      slug: `racing-switch-team-${generatePublicId('organization').slice(4, 14)}`,
      type: 'TEAM',
      ownerUserId: user.id,
    });

    // The switch lands after the refresh has read the session (and signed for the personal
    // organization) and before its rotation runs.
    const rotate = AuthSessionService.prototype.refreshSessionCredentials;
    let switchedMidRefresh = false;
    const interleave = vi
      .spyOn(AuthSessionService.prototype, 'refreshSessionCredentials')
      .mockImplementationOnce(async function (this: AuthSessionService, options) {
        const switched = await app.inject({
          method: 'POST',
          url: testApiPath('/auth/switch-to-organization'),
          headers: { authorization: `Bearer ${loginToken}` },
          payload: { organization_id: organizationB.organization.public_id },
        });
        expect(switched.statusCode, switched.body).toBe(200);
        switchedMidRefresh = true;
        return rotate.call(this, options);
      });

    let refreshResponse: Awaited<ReturnType<FastifyInstance['inject']>>;
    try {
      refreshResponse = await app.inject({
        method: 'POST',
        url: testApiPath('/auth/refresh'),
        headers: { cookie, origin: 'http://localhost:3000' },
        payload: {},
      });
    } finally {
      interleave.mockRestore();
    }
    expect(refreshResponse.statusCode, refreshResponse.body).toBe(200);
    expect(switchedMidRefresh).toBe(true);
    const refreshedToken = (refreshResponse.json() as { data: { access_token: string } }).data
      .access_token;
    expect(decodeOrgClaim(refreshedToken)).toBe(organizationB.organization.public_id);

    // The token the refresh answered with is the session's live one, on the switched organization.
    const context = await app.inject({
      method: 'GET',
      url: testApiPath('/auth/me/context'),
      headers: { authorization: `Bearer ${refreshedToken}` },
    });
    expect(context.statusCode, context.body).toBe(200);
    expect(
      (context.json() as { data: { active_organization: { id: string } | null } }).data
        .active_organization?.id,
    ).toBe(organizationB.organization.public_id);
  });

  it('refresh falls back to the default organization when the persisted membership is no longer valid', async () => {
    const { user, password } = await createTestUserWithPassword();
    const personal = await provisionPersonalOrganization({ ownerUserId: user.id });

    const loginResponse = await injectUnauthenticated(app, {
      method: 'POST',
      url: testApiPath('/auth/login'),
      payload: { email: user.email, password },
    });
    expect(loginResponse.statusCode).toBe(200);
    const cookie = sessionCookie(loginResponse.headers);

    const organizationB = await provisionOrganizationWithOwner({
      name: 'Stale Refresh Team',
      slug: `stale-refresh-team-${generatePublicId('organization').slice(4, 14)}`,
      type: 'TEAM',
      ownerUserId: user.id,
    });
    const loginToken = (loginResponse.json() as { data: { access_token: string } }).data
      .access_token;
    const switched = await app.inject({
      method: 'POST',
      url: testApiPath('/auth/switch-to-organization'),
      headers: { authorization: `Bearer ${loginToken}` },
      payload: { organization_id: organizationB.organization.public_id },
    });
    expect(switched.statusCode, switched.body).toBe(200);
    expect(
      decodeOrgClaim((switched.json() as { data: { access_token: string } }).data.access_token),
    ).toBe(organizationB.organization.public_id);

    // Persisted session organization now points at a membership that no longer authorizes the user.
    const suspended = await getOperatorDatabase()
      .update(memberships)
      .set({ status: MEMBERSHIP_STATUS.SUSPENDED })
      .where(
        and(
          eq(memberships.user_id, user.id),
          eq(memberships.organization_id, organizationB.organization.id),
        ),
      )
      .returning({ status: memberships.status });
    expect(suspended).toEqual([{ status: MEMBERSHIP_STATUS.SUSPENDED }]);

    const refreshResponse = await app.inject({
      method: 'POST',
      url: testApiPath('/auth/refresh'),
      headers: { cookie, origin: 'http://localhost:3000' },
      payload: {},
    });
    expect(refreshResponse.statusCode).toBe(200);
    const refreshedToken = (refreshResponse.json() as { data: { access_token: string } }).data
      .access_token;
    expect(decodeOrgClaim(refreshedToken)).toBe(personal.organization.public_id);
  });
});
