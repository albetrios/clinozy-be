import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { generateTestToken, generateTestTokenAndSession } from '@/tests/helpers/test-auth.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import {
  createMembership,
  createRoleWithPermissions,
  seedAllPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';

/** What both the owner and the Admin hold here: the organization and its member list. */
const MANAGER_PERMISSIONS = [
  TENANCY_PERMISSIONS.ORGANIZATION_READ,
  TENANCY_PERMISSIONS.ORGANIZATION_UPDATE,
  TENANCY_PERMISSIONS.MEMBERSHIP_READ,
];

/**
 * B2-3: an organization's `status` is its owner's alone, behind a fresh step-up, and a suspended
 * organization is closed the same way everywhere — no member permission, no switch-in — except
 * that its owner can still switch in and reactivate it.
 */
describe('Organization status — owner only, consistent effects (B2-3)', () => {
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

  async function clinicWithAdmin() {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: MANAGER_PERMISSIONS,
    });
    await createMembership({ userId: owner.id, organizationId: organization.id, roleId: role.id });
    const admin = await createTestUser();
    await createMembership({ userId: admin.id, organizationId: organization.id, roleId: role.id });
    const tokenFor = (userPublicId: string, stepUp: boolean) =>
      generateTestToken({
        userId: userPublicId,
        organizationPublicId: organization.public_id,
        stepUp,
      });
    return { owner, admin, organization, tokenFor };
  }

  function patchStatus(options: { token: string; status: string }) {
    return injectAuthenticated(app, {
      method: 'PATCH',
      url: testApiPath('/tenancy/organization'),
      token: options.token,
      headers: { 'x-idempotency-key': `idem-${randomUUID()}` },
      payload: { status: options.status },
    });
  }

  function listMembers(token: string) {
    return injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath('/tenancy/organization/memberships'),
      token,
    });
  }

  async function statusOf(organizationId: number) {
    const [row] = await getOperatorDatabase()
      .select({ status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, organizationId));
    return row!.status;
  }

  it('refuses an Admin (organization:update, fresh step-up) who sends status — 403 owner_only', async () => {
    const { admin, organization, tokenFor } = await clinicWithAdmin();
    const response = await patchStatus({
      token: await tokenFor(admin.public_id, true),
      status: 'SUSPENDED',
    });
    expect(response.statusCode, response.body).toBe(403);
    expect((response.json() as { error: { reason?: string } }).error.reason).toBe('owner_only');
    expect(await statusOf(organization.id)).toBe('ACTIVE');
  });

  it('refuses the owner without a recent step-up (403) and leaves the status alone', async () => {
    const { owner, organization, tokenFor } = await clinicWithAdmin();
    const response = await patchStatus({
      token: await tokenFor(owner.public_id, false),
      status: 'SUSPENDED',
    });
    expect(response.statusCode, response.body).toBe(403);
    expect(await statusOf(organization.id)).toBe('ACTIVE');
  });

  it('still lets an Admin rename the organization without a step-up (status is the only gated field)', async () => {
    const { admin, tokenFor } = await clinicWithAdmin();
    const response = await injectAuthenticated(app, {
      method: 'PATCH',
      url: testApiPath('/tenancy/organization'),
      token: await tokenFor(admin.public_id, false),
      headers: { 'x-idempotency-key': `idem-${randomUUID()}` },
      payload: { name: 'Renamed Clinic' },
    });
    expect(response.statusCode, response.body).toBe(200);
  });

  it('suspends for everyone but the owner, who can still switch in and reactivate it', async () => {
    const { owner, admin, organization, tokenFor } = await clinicWithAdmin();
    const adminToken = await tokenFor(admin.public_id, false);
    // Cached before the suspension: the purge after commit must drop it.
    expect((await listMembers(adminToken)).statusCode).toBe(200);

    const suspended = await patchStatus({
      token: await tokenFor(owner.public_id, true),
      status: 'SUSPENDED',
    });
    expect(suspended.statusCode, suspended.body).toBe(200);
    expect(await statusOf(organization.id)).toBe('SUSPENDED');

    // Members: no permission, no switch-in.
    expect((await listMembers(adminToken)).statusCode).toBe(403);
    const adminSession = await generateTestTokenAndSession({ userId: admin.public_id });
    const adminSwitch = await injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/auth/switch-to-organization'),
      token: adminSession.token,
      payload: { organization_id: organization.public_id },
    });
    expect(adminSwitch.statusCode, adminSwitch.body).toBe(403);

    // The owner: switches in, reads the organization (nothing more), reactivates it.
    const ownerSession = await generateTestTokenAndSession({ userId: owner.public_id });
    const ownerSwitch = await injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/auth/switch-to-organization'),
      token: ownerSession.token,
      payload: { organization_id: organization.public_id },
    });
    expect(ownerSwitch.statusCode, ownerSwitch.body).toBe(200);
    const ownerToken = await tokenFor(owner.public_id, true);
    expect((await listMembers(ownerToken)).statusCode).toBe(403);
    const read = await injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath('/tenancy/organization'),
      token: ownerToken,
    });
    expect(read.statusCode, read.body).toBe(200);
    const reactivated = await patchStatus({ token: ownerToken, status: 'ACTIVE' });
    expect(reactivated.statusCode, reactivated.body).toBe(200);

    expect((await listMembers(adminToken)).statusCode).toBe(200);
  });
});
