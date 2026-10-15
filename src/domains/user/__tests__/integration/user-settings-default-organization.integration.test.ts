import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { injectUnauthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser, createTestUserWithPassword } from '@/tests/factories/user.factory.js';
import {
  provisionOrganizationWithOwner,
  provisionPersonalOrganization,
} from '@/domains/tenancy/sub-domains/organization/organization-provisioning.js';
import { seedAllPermissions } from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';

/**
 * The clinic at sign-in (feat-choose-default-clinic): `PATCH /users/me/settings` pins a clinic the
 * caller actively belongs to (or `null` for the clinic used last), `GET` reports it, and the next
 * login mints its token for the pinned clinic — ahead of the clinic last switched to.
 */
describe('PATCH /users/me/settings — default_organization_id', () => {
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

  function patchSettings({ accessToken, body }: { accessToken: string; body: unknown }) {
    return app.inject({
      method: 'PATCH',
      url: testApiPath('/users/me/settings'),
      headers: { authorization: `Bearer ${accessToken}` },
      payload: body as Record<string, unknown>,
    });
  }

  async function clinic({ ownerUserId, name }: { ownerUserId: number; name: string }) {
    const { organization } = await provisionOrganizationWithOwner({
      name,
      slug: `${name.toLowerCase()}-${generatePublicId('organization').slice(4, 14)}`,
      type: 'TEAM',
      ownerUserId,
    });
    return organization;
  }

  it('pins a clinic, reports it, opens it at the next login, and null returns to the clinic used last', async () => {
    const { user, password } = await createTestUserWithPassword();
    await provisionPersonalOrganization({ ownerUserId: user.id });
    const pinned = await clinic({ ownerUserId: user.id, name: 'Pinned' });
    const other = await clinic({ ownerUserId: user.id, name: 'Other' });

    const token = await login({ email: user.email, password });
    const switched = await app.inject({
      method: 'POST',
      url: testApiPath('/auth/switch-to-organization'),
      headers: { authorization: `Bearer ${token}` },
      payload: { organization_id: other.public_id },
    });
    expect(switched.statusCode, switched.body).toBe(200);
    const switchedToken = (switched.json() as { data: { access_token: string } }).data.access_token;

    const saved = await patchSettings({
      accessToken: switchedToken,
      body: { default_organization_id: pinned.public_id },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(
      (saved.json() as { data: { default_organization_id: string | null } }).data
        .default_organization_id,
    ).toBe(pinned.public_id);

    const read = await app.inject({
      method: 'GET',
      url: testApiPath('/users/me/settings'),
      headers: { authorization: `Bearer ${switchedToken}` },
    });
    expect(
      (read.json() as { data: { default_organization_id: string | null } }).data
        .default_organization_id,
    ).toBe(pinned.public_id);

    // The clinic last switched to is `other`; the pin wins.
    expect(decodeOrgClaim(await login({ email: user.email, password }))).toBe(pinned.public_id);

    const nextToken = await login({ email: user.email, password });
    const cleared = await patchSettings({
      accessToken: nextToken,
      body: { default_organization_id: null },
    });
    expect(cleared.statusCode, cleared.body).toBe(200);
    expect(
      (cleared.json() as { data: { default_organization_id: string | null } }).data
        .default_organization_id,
    ).toBeNull();
    expect(decodeOrgClaim(await login({ email: user.email, password }))).toBe(other.public_id);
  });

  it("answers 422 default_organization_unavailable for someone else's clinic, a personal workspace or an unknown id", async () => {
    const { user, password } = await createTestUserWithPassword();
    const stranger = await createTestUser();
    const personal = await provisionPersonalOrganization({ ownerUserId: user.id });
    await clinic({ ownerUserId: user.id, name: 'Mine' });
    const theirs = await clinic({ ownerUserId: stranger.id, name: 'Theirs' });
    const token = await login({ email: user.email, password });

    for (const organizationPublicId of [
      theirs.public_id,
      personal.organization.public_id,
      generatePublicId('organization'),
    ]) {
      const response = await patchSettings({
        accessToken: token,
        body: { default_organization_id: organizationPublicId },
      });
      expect(response.statusCode, response.body).toBe(422);
      expect((response.json() as { error: { reason?: string } }).error.reason).toBe(
        'default_organization_unavailable',
      );
    }
  });

  it('answers 400 for a blank default_organization_id', async () => {
    const { user, password } = await createTestUserWithPassword();
    const token = await login({ email: user.email, password });

    const response = await patchSettings({
      accessToken: token,
      body: { default_organization_id: '' },
    });
    expect(response.statusCode, response.body).toBe(400);
  });
});
