import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { env } from '@/shared/config/env.config.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import {
  generateTestToken,
  generateTestTokenWithActiveSession,
} from '@/tests/helpers/test-auth.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import {
  createMembership,
  createRoleWithPermissions,
  MEMBERSHIP_WRITE_PERMISSION_CODES,
  seedPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';

/**
 * The dev-only invitation accept-token echo (launch ROUTE #164, D82).
 *
 * The invitation email never arrives on a developer's machine and only the token's hash is
 * stored, so with `MEMBERSHIP_INVITATION_TOKEN_ECHO_ENABLED` on the add-member answer carries
 * `invitation.debug_invitation_token` and the resend answer `debug_invitation_token` — and a test
 * member accepts through the real accept route with it. Off (the harness default and the
 * production-safe value) neither answer carries it. The env schema refuses the flag outside the
 * `local` and `development` targets (`env-schema.unit.test.ts`).
 */
describe('Membership invitation accept-token echo (ROUTE #164)', () => {
  let app: FastifyInstance;
  const PERMISSION_CODES = [
    TENANCY_PERMISSIONS.MEMBERSHIP_READ,
    ...MEMBERSHIP_WRITE_PERMISSION_CODES,
    TENANCY_PERMISSIONS.ORGANIZATION_READ,
  ];

  beforeAll(async () => {
    const { app: testApplication } = await createTestApp();
    app = testApplication;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    await seedPermissions(PERMISSION_CODES);
  });

  afterEach(() => {
    env.MEMBERSHIP_INVITATION_TOKEN_ECHO_ENABLED = false;
  });

  /** An organization admin, and a verified login the admin is about to add. */
  async function createContext() {
    const admin = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: admin.id });
    const adminRole = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: PERMISSION_CODES,
    });
    await createMembership({
      userId: admin.id,
      organizationId: organization.id,
      roleId: adminRole.id,
    });
    const { token: adminToken } = await generateTestTokenWithActiveSession(app, admin.public_id, {
      organizationPublicId: organization.public_id,
    });
    const memberRole = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [TENANCY_PERMISSIONS.MEMBERSHIP_READ],
    });
    const invitee = await createTestUser({
      email: `echo-${randomUUID()}@test.com`,
      isEmailVerified: true,
    });
    const inviteeToken = await generateTestToken({ userId: invitee.public_id });
    return { organization, adminToken, memberRole, invitee, inviteeToken };
  }

  type AddMemberAnswer = {
    data: { id: string; invitation: { id: string; debug_invitation_token?: string } | null };
  };
  type InvitationAnswer = { data: { id: string; debug_invitation_token?: string } };

  async function addMember(context: Awaited<ReturnType<typeof createContext>>) {
    return injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/tenancy/organization/memberships'),
      token: context.adminToken,
      headers: { 'x-idempotency-key': `idem-${randomUUID()}` },
      payload: { email: context.invitee.email, role_ids: [context.memberRole.public_id] },
    });
  }

  async function resendInvitation(adminToken: string, membershipPublicId: string) {
    return injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath(`/tenancy/organization/memberships/${membershipPublicId}/invitation/resend`),
      token: adminToken,
      headers: { 'x-idempotency-key': `idem-${randomUUID()}` },
      payload: {},
    });
  }

  async function acceptInvitation(options: {
    inviteeToken: string;
    invitationPublicId: string;
    token: string;
  }) {
    return injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath(`/tenancy/membership-invitations/${options.invitationPublicId}/accept`),
      token: options.inviteeToken,
      headers: { 'x-idempotency-key': `idem-${randomUUID()}` },
      payload: { token: options.token },
    });
  }

  async function readMembershipStatus(membershipPublicId: string) {
    const [row] = await getOperatorDatabase()
      .select({ status: memberships.status })
      .from(memberships)
      .where(eq(memberships.public_id, membershipPublicId));
    return row?.status;
  }

  it('on: the add-member answer carries the accept token, and the invitee accepts with it', async () => {
    env.MEMBERSHIP_INVITATION_TOKEN_ECHO_ENABLED = true;
    const context = await createContext();

    const added = await addMember(context);
    expect(added.statusCode).toBe(200);
    const { data: membership } = added.json() as AddMemberAnswer;
    const echoedToken = membership.invitation?.debug_invitation_token;
    expect(echoedToken).toMatch(/^[0-9a-f]{64}$/);
    // A secret-bearing answer is never cached by a proxy (compress.middleware).
    expect(String(added.headers['cache-control'])).toContain('no-store');

    const accepted = await acceptInvitation({
      inviteeToken: context.inviteeToken,
      invitationPublicId: membership.invitation!.id,
      token: echoedToken!,
    });
    expect(accepted.statusCode).toBe(200);
    expect((accepted.json() as { data: { organization_id: string } }).data.organization_id).toBe(
      context.organization.public_id,
    );
    expect(await readMembershipStatus(membership.id)).toBe('active');
  });

  it('on: the resend answer carries the new token — it accepts, the replaced one does not', async () => {
    env.MEMBERSHIP_INVITATION_TOKEN_ECHO_ENABLED = true;
    const context = await createContext();
    const { data: membership } = (await addMember(context)).json() as AddMemberAnswer;
    const firstToken = membership.invitation!.debug_invitation_token!;

    const resent = await resendInvitation(context.adminToken, membership.id);
    expect(resent.statusCode).toBe(200);
    const { data: invitation } = resent.json() as InvitationAnswer;
    expect(invitation.id).toBe(membership.invitation!.id);
    expect(invitation.debug_invitation_token).toMatch(/^[0-9a-f]{64}$/);
    expect(invitation.debug_invitation_token).not.toBe(firstToken);

    const withReplacedToken = await acceptInvitation({
      inviteeToken: context.inviteeToken,
      invitationPublicId: invitation.id,
      token: firstToken,
    });
    expect(withReplacedToken.statusCode).toBe(400);
    expect(await readMembershipStatus(membership.id)).toBe('invited');

    const withNewToken = await acceptInvitation({
      inviteeToken: context.inviteeToken,
      invitationPublicId: invitation.id,
      token: invitation.debug_invitation_token!,
    });
    expect(withNewToken.statusCode).toBe(200);
    expect(await readMembershipStatus(membership.id)).toBe('active');
  });

  it('off: neither the add-member nor the resend answer carries a token', async () => {
    const context = await createContext();

    const added = await addMember(context);
    expect(added.statusCode).toBe(200);
    const { data: membership } = added.json() as AddMemberAnswer;
    expect(membership.invitation).not.toBeNull();
    expect(membership.invitation).not.toHaveProperty('debug_invitation_token');

    const resent = await resendInvitation(context.adminToken, membership.id);
    expect(resent.statusCode).toBe(200);
    expect((resent.json() as InvitationAnswer).data).not.toHaveProperty('debug_invitation_token');
  });

  it('on: the resend route keeps its permission gate', async () => {
    env.MEMBERSHIP_INVITATION_TOKEN_ECHO_ENABLED = true;
    const context = await createContext();
    const { data: membership } = (await addMember(context)).json() as AddMemberAnswer;

    // A member holding only membership:read cannot resend — and so cannot mint a token.
    const reader = await createTestUser();
    await createMembership({
      userId: reader.id,
      organizationId: context.organization.id,
      roleId: context.memberRole.id,
    });
    const { token: readerToken } = await generateTestTokenWithActiveSession(app, reader.public_id, {
      organizationPublicId: context.organization.public_id,
    });
    const refused = await resendInvitation(readerToken, membership.id);
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).not.toHaveProperty('data');
  });
});
