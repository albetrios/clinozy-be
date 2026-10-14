import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
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
 * Sign-in opens the clinic the person last worked in: `switch-to-organization` remembers the
 * clinic, and the next login mints its token for it — ahead of a clinic joined later and of the
 * personal workspace, which the frontend would answer with the clinic picker. Drives the real
 * HTTP login → switch → login flow and reads the minted `org` claim.
 */
describe('login restores the last clinic', () => {
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
    await seedAllPermissions();
  });

  function decodeOrgClaim(accessToken: string): string | undefined {
    const payloadSegment = accessToken.split('.')[1]!;
    const json = Buffer.from(payloadSegment, 'base64url').toString('utf8');
    return (JSON.parse(json) as { org?: string }).org;
  }

  async function login({ email, password }: { email: string; password: string }) {
    const response = await injectUnauthenticated(app, {
      method: 'POST',
      url: testApiPath('/auth/login'),
      payload: { email, password },
    });
    expect(response.statusCode, response.body).toBe(200);
    return (response.json() as { data: { access_token: string } }).data.access_token;
  }

  async function switchTo({
    accessToken,
    organizationPublicId,
  }: {
    accessToken: string;
    organizationPublicId: string;
  }) {
    const response = await app.inject({
      method: 'POST',
      url: testApiPath('/auth/switch-to-organization'),
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { organization_id: organizationPublicId },
    });
    expect(response.statusCode, response.body).toBe(200);
  }

  /** A person with a personal workspace, an older clinic and a newer one. */
  async function personWithTwoClinics() {
    const { user, password } = await createTestUserWithPassword();
    await provisionPersonalOrganization({ ownerUserId: user.id });
    const clinic = async (name: string) =>
      (
        await provisionOrganizationWithOwner({
          name,
          slug: `${name.toLowerCase()}-clinic-${generatePublicId('organization').slice(4, 14)}`,
          type: 'TEAM',
          ownerUserId: user.id,
        })
      ).organization;
    const older = await clinic('Older');
    const newer = await clinic('Newer');
    await getOperatorDatabase()
      .update(memberships)
      .set({ joined_at: new Date('2026-01-01T00:00:00Z') })
      .where(and(eq(memberships.user_id, user.id), eq(memberships.organization_id, older.id)));
    return { user, password, older, newer };
  }

  it('the first login opens the newest clinic, and after a switch the next login opens the switched-to clinic', async () => {
    const { user, password, older, newer } = await personWithTwoClinics();

    const firstToken = await login({ email: user.email, password });
    expect(decodeOrgClaim(firstToken)).toBe(newer.public_id);

    await switchTo({ accessToken: firstToken, organizationPublicId: older.public_id });

    const secondToken = await login({ email: user.email, password });
    expect(decodeOrgClaim(secondToken)).toBe(older.public_id);
    const thirdToken = await login({ email: user.email, password });
    expect(decodeOrgClaim(thirdToken)).toBe(older.public_id);
  });

  it('skips the remembered clinic once the membership is no longer active', async () => {
    const { user, password, older, newer } = await personWithTwoClinics();
    const firstToken = await login({ email: user.email, password });
    await switchTo({ accessToken: firstToken, organizationPublicId: older.public_id });

    await getOperatorDatabase()
      .update(memberships)
      .set({ status: MEMBERSHIP_STATUS.SUSPENDED })
      .where(and(eq(memberships.user_id, user.id), eq(memberships.organization_id, older.id)));

    expect(decodeOrgClaim(await login({ email: user.email, password }))).toBe(newer.public_id);
  });
});
