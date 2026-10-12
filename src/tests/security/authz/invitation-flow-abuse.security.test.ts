import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import {
  seedAllPermissions,
  createRoleWithPermissions,
  createMembership,
  MEMBERSHIP_WRITE_PERMISSION_CODES,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { database } from '@/infrastructure/database/connection.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { membership_invitations } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.schema.js';
import { MembershipInvitationRepository } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.repository.js';
import { hashInvitationToken } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.token.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';

/**
 * Business-flow abuse on the invitation lifecycle — item 6 of
 * `docs/reference/security/authorization-coverage-gaps.md`, previously open.
 *
 * Every step of invite → revoke → resend → accept was already tested **individually**. What was
 * not tested is the flow as an attacker drives it: the interesting bugs here are not in any single
 * handler but in the *ordering* between them — a revoked invitation that is still acceptable, an
 * accept that can be replayed, a rotated token whose predecessor still works, a hostile accept that
 * burns the invitation for the real invitee.
 *
 * Each case below is a two- or three-step sequence with an assertion on the state left behind, not
 * only on the status code — a handler that returned the right refusal after mutating state would
 * pass a status-only test and still be wrong.
 *
 * e2e — runs in CI (Postgres + Redis required).
 */
describe('Security: invitation lifecycle flow abuse', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const created = await createTestApp();
    app = created.app;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    await seedAllPermissions();
  });

  const ADMIN_PERMISSIONS = [
    ...MEMBERSHIP_WRITE_PERMISSION_CODES,
    TENANCY_PERMISSIONS.MEMBERSHIP_READ,
    TENANCY_PERMISSIONS.ROLE_READ,
    TENANCY_PERMISSIONS.ORGANIZATION_READ,
  ];

  /**
   * Mints an organization, an admin who can manage invitations, and a pending invitation for a
   * freshly-created verified invitee. The raw token is returned — normally it only ever exists in
   * the invitation email, which is exactly why these sequences cannot be driven through the API
   * alone.
   */
  async function createPendingInvitation(options?: { expired?: boolean }) {
    const admin = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: admin.id });
    const adminRole = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: ADMIN_PERMISSIONS,
    });
    await createMembership({
      userId: admin.id,
      organizationId: organization.id,
      roleId: adminRole.id,
    });
    const adminToken = await generateTestToken({
      userId: admin.public_id,
      organizationPublicId: organization.public_id,
    });

    const invitee = await createTestUser({
      email: `invitee-${randomUUID()}@test.com`,
      isEmailVerified: true,
    });
    const memberRole = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [TENANCY_PERMISSIONS.MEMBERSHIP_READ],
    });
    const [inviteeMembership] = await database
      .insert(memberships)
      .values({
        public_id: generatePublicId('membership'),
        user_id: invitee.id,
        organization_id: organization.id,
        role_id: memberRole.id,
        status: 'invited',
      })
      .returning();

    const rawToken = `flow-token-${randomUUID()}`;
    let invitation: { public_id: string; id: number };
    if (options?.expired) {
      // `chk_membership_invitations_expires` enforces `expires_at > created_at`, so an already-expired row
      // cannot be created with a default `created_at` of now — the only lawful shape for one is a
      // backdated pair. Inserted directly because the repository's `create` does not take
      // `created_at` (by design: nothing in production backdates an invitation).
      const createdAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);
      const expiresAt = new Date(Date.now() - 29 * 24 * 60 * 60 * 1_000);
      const [row] = await database
        .insert(membership_invitations)
        .values({
          public_id: generatePublicId('membershipInvitation'),
          membership_id: inviteeMembership!.id,
          email: invitee.email,
          token_hash: hashInvitationToken(rawToken),
          invited_by_user_id: admin.id,
          expires_at: expiresAt,
          created_at: createdAt,
          created_by_user_id: admin.id,
        })
        .returning();
      invitation = row!;
    } else {
      invitation = await new MembershipInvitationRepository().create({
        membership_id: inviteeMembership!.id,
        email: invitee.email,
        token_hash: hashInvitationToken(rawToken),
        invited_by_user_id: admin.id,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1_000),
        created_by_user_id: admin.id,
      });
    }

    const inviteeToken = await generateTestToken({ userId: invitee.public_id });
    return {
      admin,
      adminToken,
      organization,
      invitee,
      inviteeToken,
      inviteeMembership: inviteeMembership!,
      invitation,
      rawToken,
    };
  }

  function acceptUrl(invitationPublicId: string) {
    return testApiPath(`/tenancy/membership-invitations/${invitationPublicId}/accept`);
  }

  /** The invitation's revoke route — under the invited membership (launch §2.C). */
  function revokeUrl(membershipPublicId: string) {
    return testApiPath(`/tenancy/organization/memberships/${membershipPublicId}/invitation`);
  }

  /** The invitation's resend route — under the invited membership (launch §2.C). */
  function resendUrl(membershipPublicId: string) {
    return testApiPath(`/tenancy/organization/memberships/${membershipPublicId}/invitation/resend`);
  }

  /** A fresh `X-Idempotency-Key` — accept and resend require one. */
  function idempotencyHeaders() {
    return { 'x-idempotency-key': `flow-${randomUUID()}` };
  }

  async function readMembershipStatus(membershipId: number) {
    const [row] = await database.select().from(memberships).where(eq(memberships.id, membershipId));
    return row;
  }

  describe('revoke closes the invitation for every downstream step', () => {
    it('a revoked invitation cannot be accepted, even with the correct token', async () => {
      // Answered **404**: revoking also ends the invited membership (REQ-1), and the accept lookup
      // (`resolve_membership_invitation_lookup_by_public_id`) never resolves the invite of a removed
      // member or a deleted organization (D59). An accepted or expired invite still resolves and is
      // refused with a 400 — after the verified-email match, so only the invitee learns its state.
      const context = await createPendingInvitation();

      const revoke = await injectAuthenticated(app, {
        method: 'DELETE',
        url: revokeUrl(context.inviteeMembership.public_id),
        token: context.adminToken,
      });
      expect(revoke.statusCode).toBe(204);

      const accept = await injectAuthenticated(app, {
        method: 'POST',
        url: acceptUrl(context.invitation.public_id),
        headers: idempotencyHeaders(),
        token: context.inviteeToken,
        payload: { token: context.rawToken },
      });
      expect(accept.statusCode).toBe(404);

      // And the membership was never activated by the attempt.
      const membership = await readMembershipStatus(context.inviteeMembership.id);
      expect(membership?.status).not.toBe('active');
    });

    it('a revoked invitation cannot be resent (no re-opening a closed invite)', async () => {
      // Resend mints a fresh token. If it worked on a revoked row, revoke would be reversible by
      // anyone holding membership:update — the audit trail would show a revoke that did not stick.
      const context = await createPendingInvitation();

      await injectAuthenticated(app, {
        method: 'DELETE',
        url: revokeUrl(context.inviteeMembership.public_id),
        token: context.adminToken,
      });

      const resend = await injectAuthenticated(app, {
        method: 'POST',
        url: resendUrl(context.inviteeMembership.public_id),
        headers: idempotencyHeaders(),
        token: context.adminToken,
        payload: { expires_in_days: 7 },
      });
      // 404 rather than the service's `invitationRevoked` 400: revoke also soft-deletes the
      // dangling invited membership (REQ-1), and resend resolves that membership before it ever
      // reaches its own revoked-at check. Pinned as 404 because that is the contract a client sees.
      expect(resend.statusCode).toBe(404);
    });

    it('revoking soft-deletes the dangling INVITED membership so no ghost invitee remains', async () => {
      const context = await createPendingInvitation();

      await injectAuthenticated(app, {
        method: 'DELETE',
        url: revokeUrl(context.inviteeMembership.public_id),
        token: context.adminToken,
      });

      const list = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath('/tenancy/organization/memberships'),
        token: context.adminToken,
      });
      expect(list.statusCode).toBe(200);
      const emails = JSON.stringify((list.json() as { data: unknown[] }).data);
      expect(emails).not.toContain(context.invitee.email);
    });
  });

  describe('accept is single-use', () => {
    it('a second accept with the same token is refused as already-accepted', async () => {
      const context = await createPendingInvitation();

      const first = await injectAuthenticated(app, {
        method: 'POST',
        url: acceptUrl(context.invitation.public_id),
        headers: idempotencyHeaders(),
        token: context.inviteeToken,
        payload: { token: context.rawToken },
      });
      expect(first.statusCode).toBe(200);

      const replay = await injectAuthenticated(app, {
        method: 'POST',
        url: acceptUrl(context.invitation.public_id),
        headers: idempotencyHeaders(),
        token: context.inviteeToken,
        payload: { token: context.rawToken },
      });
      // An accepted invite still resolves (D59), so the replay is the service's 400
      // (`invitation_already_accepted`); the membership stays active, joined once.
      expect(replay.statusCode).toBe(400);
      expect(replay.body).toContain('invitation_already_accepted');
      const membership = await readMembershipStatus(context.inviteeMembership.id);
      expect(membership?.status).toBe('active');
    });

    it('an accepted invitation cannot be resent', async () => {
      const context = await createPendingInvitation();

      await injectAuthenticated(app, {
        method: 'POST',
        url: acceptUrl(context.invitation.public_id),
        headers: idempotencyHeaders(),
        token: context.inviteeToken,
        payload: { token: context.rawToken },
      });

      const resend = await injectAuthenticated(app, {
        method: 'POST',
        url: resendUrl(context.inviteeMembership.public_id),
        headers: idempotencyHeaders(),
        token: context.adminToken,
        payload: { expires_in_days: 7 },
      });
      expect(resend.statusCode).toBe(400);
      expect(resend.body).toContain('accepted');
    });
  });

  describe('resend rotates the token', () => {
    it('invalidates the previously issued token', async () => {
      // The old link is the one sitting in a forwarded email or a leaked inbox. Resend overwrites
      // `token_hash`, so the predecessor must stop working — otherwise "resend to rotate a token
      // we think leaked" is security theatre.
      const context = await createPendingInvitation();

      const resend = await injectAuthenticated(app, {
        method: 'POST',
        url: resendUrl(context.inviteeMembership.public_id),
        headers: idempotencyHeaders(),
        token: context.adminToken,
        payload: { expires_in_days: 7 },
      });
      expect(resend.statusCode).toBe(200);

      const acceptWithOldToken = await injectAuthenticated(app, {
        method: 'POST',
        url: acceptUrl(context.invitation.public_id),
        headers: idempotencyHeaders(),
        token: context.inviteeToken,
        payload: { token: context.rawToken },
      });
      expect(acceptWithOldToken.statusCode).toBe(400);

      // The invitation is still open — the rotation refused the stale token without consuming it.
      const membership = await readMembershipStatus(context.inviteeMembership.id);
      expect(membership?.status).toBe('invited');
    });
  });

  describe('a hostile accept must not consume the invitation', () => {
    it('rejects a forwarded link used by a different verified user, and the real invitee can still accept', async () => {
      // The whole point of binding accept to the invitee's email (sec-T4) is defeated if the failed
      // attempt marks the invitation used — the attacker could not join, but they could permanently
      // deny the invitee.
      const context = await createPendingInvitation();
      const attacker = await createTestUser({
        email: `attacker-${randomUUID()}@test.com`,
        isEmailVerified: true,
      });
      const attackerToken = await generateTestToken({ userId: attacker.public_id });

      const hostile = await injectAuthenticated(app, {
        method: 'POST',
        url: acceptUrl(context.invitation.public_id),
        headers: idempotencyHeaders(),
        token: attackerToken,
        payload: { token: context.rawToken },
      });
      expect(hostile.statusCode).toBe(403);

      const legitimate = await injectAuthenticated(app, {
        method: 'POST',
        url: acceptUrl(context.invitation.public_id),
        headers: idempotencyHeaders(),
        token: context.inviteeToken,
        payload: { token: context.rawToken },
      });
      expect(legitimate.statusCode).toBe(200);

      const membership = await readMembershipStatus(context.inviteeMembership.id);
      expect(membership?.status).toBe('active');
    });

    it('rejects a wrong token without consuming the invitation', async () => {
      const context = await createPendingInvitation();

      const wrongToken = await injectAuthenticated(app, {
        method: 'POST',
        url: acceptUrl(context.invitation.public_id),
        headers: idempotencyHeaders(),
        token: context.inviteeToken,
        payload: { token: `flow-token-${randomUUID()}` },
      });
      expect(wrongToken.statusCode).toBe(400);

      const legitimate = await injectAuthenticated(app, {
        method: 'POST',
        url: acceptUrl(context.invitation.public_id),
        headers: idempotencyHeaders(),
        token: context.inviteeToken,
        payload: { token: context.rawToken },
      });
      expect(legitimate.statusCode).toBe(200);
    });
  });

  describe('expiry', () => {
    it('refuses to accept an expired invitation even with the correct token', async () => {
      const context = await createPendingInvitation({ expired: true });

      const accept = await injectAuthenticated(app, {
        method: 'POST',
        url: acceptUrl(context.invitation.public_id),
        headers: idempotencyHeaders(),
        token: context.inviteeToken,
        payload: { token: context.rawToken },
      });
      expect(accept.statusCode).toBe(400);
      expect(accept.body).toContain('expired');

      const membership = await readMembershipStatus(context.inviteeMembership.id);
      expect(membership?.status).toBe('invited');
    });

    it('resends an expired invitation with a new token and a new expiry (T11)', async () => {
      const context = await createPendingInvitation({ expired: true });

      const resend = await injectAuthenticated(app, {
        method: 'POST',
        url: resendUrl(context.inviteeMembership.public_id),
        headers: idempotencyHeaders(),
        token: context.adminToken,
        payload: { expires_in_days: 7 },
      });
      expect(resend.statusCode).toBe(200);
      const [rotated] = await database
        .select()
        .from(membership_invitations)
        .where(eq(membership_invitations.id, context.invitation.id));
      expect(rotated!.expires_at.getTime()).toBeGreaterThan(Date.now());
      expect(rotated!.token_hash).not.toBe(hashInvitationToken(context.rawToken));

      // The old token is dead; the invitation is open again for the new one only.
      const acceptWithOldToken = await injectAuthenticated(app, {
        method: 'POST',
        url: acceptUrl(context.invitation.public_id),
        headers: idempotencyHeaders(),
        token: context.inviteeToken,
        payload: { token: context.rawToken },
      });
      expect(acceptWithOldToken.statusCode).toBe(400);
    });
  });
});
