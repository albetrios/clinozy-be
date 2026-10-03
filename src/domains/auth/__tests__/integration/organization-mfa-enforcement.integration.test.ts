import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { generate as generateTotp } from 'otplib';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import {
  injectAuthenticated,
  injectUnauthenticated,
} from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser, createTestUserWithPassword } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { generateTestToken, generateTestTokenAndSession } from '@/tests/helpers/test-auth.js';
import { seedRecentStepUpForTestUser } from '@/tests/helpers/test-step-up.helper.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import {
  createMembership,
  createRoleWithPermissions,
  seedPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { organization_settings } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.schema.js';
import { invalidateOrganizationMfaPolicy } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-mfa-policy.js';

const ALLOWED_ORIGIN = 'http://localhost:3000';

function tokenClaims(accessToken: string): { org?: string; amr?: string[] } {
  return JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString('utf8'));
}

/** The machine-readable reason on the error envelope (`{ error: { code, reason, detail } }`). */
function errorReason(response: { json: () => unknown }): string | undefined {
  return (response.json() as { error?: { reason?: string } }).error?.reason;
}

function sessionCookiePair(headers: { 'set-cookie'?: string | string[] | number | undefined }) {
  const raw = headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const sessionCookie = cookies.find((cookie) => cookie.startsWith('session_id='));
  expect(sessionCookie).toBeDefined();
  return String(sessionCookie).split(';')[0]!.trim();
}

/**
 * Organization-mandated MFA must hold wherever organization authority is minted or used — not only
 * at first-factor login. The attack: log in without MFA while a membership is still INVITED (so the
 * login-time gate does not fire), have the membership become ACTIVE (invitation accepted, or a
 * reactivation), then switch the same first-factor session into the MFA-required organization. The
 * same applies when an organization turns MFA on after its members logged in.
 */
describe('organization MFA policy is enforced after login', () => {
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
    await seedPermissions(Object.values(TENANCY_PERMISSIONS));
  });

  async function organizationWithMember(options: { userId: number; mfaRequired: boolean }) {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    await getOperatorDatabase()
      .insert(organization_settings)
      .values({
        organization_id: organization.id,
        security_policy: { mfa_required: options.mfaRequired },
        default_locale: 'en',
      });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [TENANCY_PERMISSIONS.MEMBERSHIP_READ],
    });
    await createMembership({
      userId: options.userId,
      organizationId: organization.id,
      roleId: role.id,
    });
    return organization;
  }

  function switchTo(token: string, organizationPublicId: string) {
    return injectAuthenticated(application, {
      method: 'POST',
      url: testApiPath('/auth/switch-to-organization'),
      token,
      payload: { organization_id: organizationPublicId },
    });
  }

  function listMembers(token: string) {
    return injectAuthenticated(application, {
      method: 'GET',
      url: testApiPath('/tenancy/organization/memberships'),
      token,
    });
  }

  it('a first-factor session cannot switch into an MFA-required organization it joined after login', async () => {
    const user = await createTestUser({ isEmailVerified: true });
    const { token } = await generateTestTokenAndSession({ userId: user.public_id });
    // The membership becomes ACTIVE after the session was issued (invitation accepted).
    const organization = await organizationWithMember({ userId: user.id, mfaRequired: true });

    const response = await switchTo(token, organization.public_id);

    expect(response.statusCode).toBe(403);
    expect(errorReason(response)).toBe('mfa_required');
  });

  it('refuses a token scoped to an MFA-required organization without amr on permission routes', async () => {
    const user = await createTestUser({ isEmailVerified: true });
    const protectedOrganization = await organizationWithMember({
      userId: user.id,
      mfaRequired: true,
    });
    const openOrganization = await organizationWithMember({ userId: user.id, mfaRequired: false });

    const protectedToken = await generateTestToken({
      userId: user.public_id,
      organizationPublicId: protectedOrganization.public_id,
    });
    const refused = await listMembers(protectedToken);
    expect(refused.statusCode).toBe(403);
    expect(errorReason(refused)).toBe('mfa_required');

    // The policy is per organization: the same user, without MFA, still works elsewhere.
    const openToken = await generateTestToken({
      userId: user.public_id,
      organizationPublicId: openOrganization.public_id,
    });
    expect((await listMembers(openToken)).statusCode).toBe(200);
  });

  it('after proving a second factor (MFA enrollment) the same session may switch in', async () => {
    const user = await createTestUser({ isEmailVerified: true });
    const { token, sessionPublicId } = await generateTestTokenAndSession({
      userId: user.public_id,
    });
    const organization = await organizationWithMember({ userId: user.id, mfaRequired: true });
    expect((await switchTo(token, organization.public_id)).statusCode).toBe(403);

    await seedRecentStepUpForTestUser(user.public_id, sessionPublicId);
    const enroll = await injectAuthenticated(application, {
      method: 'POST',
      url: testApiPath('/auth/me/mfa/enroll'),
      token,
      payload: { method_type: 'MFA_TOTP' },
    });
    expect(enroll.statusCode).toBe(200);
    const { secret } = (enroll.json() as { data: { secret: string } }).data;
    const confirm = await injectAuthenticated(application, {
      method: 'POST',
      url: testApiPath('/auth/me/mfa/enroll/confirm'),
      token,
      payload: { code: await generateTotp({ secret }) },
    });
    expect(confirm.statusCode).toBe(200);

    const switched = await switchTo(token, organization.public_id);
    expect(switched.statusCode).toBe(200);
    const accessToken = (switched.json() as { data: { access_token: string } }).data.access_token;
    expect(tokenClaims(accessToken)).toMatchObject({ org: organization.public_id, amr: ['mfa'] });
    expect((await listMembers(accessToken)).statusCode).toBe(200);
  });

  it('an organization turning MFA on refuses existing sessions — and refresh stops minting it', async () => {
    const { user, password } = await createTestUserWithPassword({ isEmailVerified: true });
    const organization = await organizationWithMember({ userId: user.id, mfaRequired: false });
    const login = await injectUnauthenticated(application, {
      method: 'POST',
      url: testApiPath('/auth/login'),
      payload: { email: user.email, password },
    });
    expect(login.statusCode).toBe(200);
    const loginToken = (login.json() as { data: { access_token: string } }).data.access_token;
    const cookie = sessionCookiePair(login.headers);
    const switched = await switchTo(loginToken, organization.public_id);
    expect(switched.statusCode).toBe(200);
    const scopedToken = (switched.json() as { data: { access_token: string } }).data.access_token;
    expect((await listMembers(scopedToken)).statusCode).toBe(200);

    // The organization turns MFA on (the settings service invalidates the cached policy).
    await getOperatorDatabase()
      .update(organization_settings)
      .set({ security_policy: { mfa_required: true } })
      .where(eq(organization_settings.organization_id, organization.id));
    await invalidateOrganizationMfaPolicy(organization.public_id);

    const refused = await listMembers(scopedToken);
    expect(refused.statusCode).toBe(403);
    expect(errorReason(refused)).toBe('mfa_required');

    const refreshed = await application.inject({
      method: 'POST',
      url: testApiPath('/auth/refresh'),
      headers: { cookie, origin: ALLOWED_ORIGIN },
      payload: {},
    });
    expect(refreshed.statusCode).toBe(200);
    const refreshedToken = (refreshed.json() as { data: { access_token: string } }).data
      .access_token;
    expect(tokenClaims(refreshedToken).org).not.toBe(organization.public_id);
  });
});
