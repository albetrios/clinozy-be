import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
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
import { membership_invitations } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.schema.js';
import { notifications } from '@/domains/notify/sub-domains/notification/notification.schema.js';
import { runMembershipInvitationExpiryJob } from '@/domains/tenancy/sub-domains/membership/membership-invitation/workers/membership-invitation-expiry.processor.js';
import { MILLISECONDS_PER_DAY } from '@/shared/constants/index.js';

/**
 * An invited person who signs in (launch D84, ROUTE #172–#175): they read their pending
 * invitations, accept one in the app without the emailed token, or decline it — which ends the
 * invited membership, frees its seat and tells the inviter — and an invitation left 7 days past
 * its expiry is ended by the sweep. Every invitation here is issued through the real add-member
 * route.
 */
describe('An invited person signs in (launch D84)', () => {
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

  /** A clinic with an admin who can add members, and a member role to invite people into. */
  async function createClinic() {
    const admin = await createTestUser();
    const organization = await createTestOrganization({
      ownerUserId: admin.id,
      name: 'Skin Studio Adajan',
    });
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
    return { admin, organization, adminToken, memberRole };
  }

  type Clinic = Awaited<ReturnType<typeof createClinic>>;

  async function createInvitee(options: { isEmailVerified?: boolean } = {}) {
    const invitee = await createTestUser({
      email: `invitee-${randomUUID()}@test.com`,
      isEmailVerified: options.isEmailVerified ?? true,
    });
    const inviteeToken = await generateTestToken({ userId: invitee.public_id });
    return { invitee, inviteeToken };
  }

  /** Invites `email` through the real add-member route; the membership and its invitation. */
  async function invite(clinic: Clinic, email: string) {
    const response = await injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/tenancy/organization/memberships'),
      token: clinic.adminToken,
      headers: { 'x-idempotency-key': `idem-${randomUUID()}` },
      payload: { email, role_ids: [clinic.memberRole.public_id] },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { id: string; invitation: { id: string } } };
    return { membershipPublicId: body.data.id, invitationPublicId: body.data.invitation.id };
  }

  async function listMine(inviteeToken: string, query = '') {
    return injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath(`/users/me/membership-invitations${query}`),
      token: inviteeToken,
    });
  }

  async function act(options: {
    inviteeToken: string;
    invitationPublicId: string;
    action: 'accept' | 'decline';
    payload?: Record<string, unknown>;
  }) {
    return injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath(
        `/tenancy/membership-invitations/${options.invitationPublicId}/${options.action}`,
      ),
      token: options.inviteeToken,
      headers: { 'x-idempotency-key': `idem-${randomUUID()}` },
      ...(options.payload === undefined ? {} : { payload: options.payload }),
    });
  }

  async function readMembership(membershipPublicId: string) {
    const [row] = await getOperatorDatabase()
      .select({
        status: memberships.status,
        deleted_at: memberships.deleted_at,
        delete_reason: memberships.delete_reason,
        display_name: memberships.display_name,
      })
      .from(memberships)
      .where(eq(memberships.public_id, membershipPublicId));
    return row;
  }

  /** Moves an invitation into the past: created `createdDaysAgo`, expired `expiredDaysAgo`. */
  async function ageInvitation(options: {
    invitationPublicId: string;
    createdDaysAgo: number;
    expiredDaysAgo: number;
  }) {
    const now = Date.now();
    await getOperatorDatabase()
      .update(membership_invitations)
      .set({
        created_at: new Date(now - options.createdDaysAgo * MILLISECONDS_PER_DAY),
        expires_at: new Date(now - options.expiredDaysAgo * MILLISECONDS_PER_DAY),
      })
      .where(eq(membership_invitations.public_id, options.invitationPublicId));
  }

  describe('GET /users/me/membership-invitations (ROUTE #172)', () => {
    it('lists my pending invitation with the clinic, the roles and who invited me', async () => {
      const clinic = await createClinic();
      const { invitee, inviteeToken } = await createInvitee();
      const { invitationPublicId } = await invite(clinic, invitee.email);

      const response = await listMine(inviteeToken);

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        data: Array<Record<string, unknown>>;
        meta: { pagination: { has_more: boolean } };
      };
      expect(body.data).toHaveLength(1);
      const [adminMembership] = await getOperatorDatabase()
        .select({ display_name: memberships.display_name })
        .from(memberships)
        .where(
          and(
            eq(memberships.user_id, clinic.admin.id),
            eq(memberships.organization_id, clinic.organization.id),
          ),
        );
      expect(body.data[0]).toEqual({
        id: invitationPublicId,
        organization: {
          id: clinic.organization.public_id,
          name: 'Skin Studio Adajan',
          slug: clinic.organization.slug,
          logo_url: null,
        },
        role_names: [clinic.memberRole.name],
        inviter_name: adminMembership?.display_name,
        expires_at: expect.any(String),
        created_at: expect.any(String),
      });
      expect(body.meta.pagination.has_more).toBe(false);
    });

    it('lists none for an unverified email, and none of somebody else’s', async () => {
      const clinic = await createClinic();
      const unverified = await createInvitee({ isEmailVerified: false });
      const someoneElse = await createInvitee();
      await invite(clinic, unverified.invitee.email);

      for (const { inviteeToken } of [unverified, someoneElse]) {
        const response = await listMine(inviteeToken);
        expect(response.statusCode).toBe(200);
        expect((response.json() as { data: unknown[] }).data).toEqual([]);
      }
    });

    it('leaves out an expired, an accepted and a declined invitation, and pages the rest', async () => {
      const { invitee, inviteeToken } = await createInvitee();
      const [expired, accepted, declined, first, second] = [
        await invite(await createClinic(), invitee.email),
        await invite(await createClinic(), invitee.email),
        await invite(await createClinic(), invitee.email),
        await invite(await createClinic(), invitee.email),
        await invite(await createClinic(), invitee.email),
      ];
      await ageInvitation({
        invitationPublicId: expired!.invitationPublicId,
        createdDaysAgo: 10,
        expiredDaysAgo: 1,
      });
      expect(
        (
          await act({
            inviteeToken,
            invitationPublicId: accepted!.invitationPublicId,
            action: 'accept',
            payload: {},
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await act({
            inviteeToken,
            invitationPublicId: declined!.invitationPublicId,
            action: 'decline',
          })
        ).statusCode,
      ).toBe(200);

      const firstPage = await listMine(inviteeToken, '?limit=1');
      const firstBody = firstPage.json() as {
        data: Array<{ id: string }>;
        meta: { pagination: { has_more: boolean; next: string | null } };
      };
      expect(firstBody.data.map((item) => item.id)).toEqual([first!.invitationPublicId]);
      expect(firstBody.meta.pagination.has_more).toBe(true);

      const secondPage = await listMine(
        inviteeToken,
        `?limit=1&after=${encodeURIComponent(firstBody.meta.pagination.next ?? '')}`,
      );
      const secondBody = secondPage.json() as {
        data: Array<{ id: string }>;
        meta: { pagination: { has_more: boolean } };
      };
      expect(secondBody.data.map((item) => item.id)).toEqual([second!.invitationPublicId]);
      expect(secondBody.meta.pagination.has_more).toBe(false);
    });
  });

  describe('POST …/accept without the token (ROUTE #173)', () => {
    it('accepts in the app for the verified, matching email — and a sent token must match', async () => {
      const clinic = await createClinic();
      const { invitee, inviteeToken } = await createInvitee();
      const { membershipPublicId, invitationPublicId } = await invite(clinic, invitee.email);

      const wrongToken = await act({
        inviteeToken,
        invitationPublicId,
        action: 'accept',
        payload: { token: 'not-the-emailed-token' },
      });
      expect(wrongToken.statusCode).toBe(400);
      expect((await readMembership(membershipPublicId))?.status).toBe('invited');

      const accepted = await act({
        inviteeToken,
        invitationPublicId,
        action: 'accept',
        payload: {},
      });
      expect(accepted.statusCode).toBe(200);
      expect((accepted.json() as { data: { organization_id: string } }).data.organization_id).toBe(
        clinic.organization.public_id,
      );
      expect((await readMembership(membershipPublicId))?.status).toBe('active');
      expect(((await listMine(inviteeToken)).json() as { data: unknown[] }).data).toEqual([]);
    });

    it('refuses an unverified email and another person', async () => {
      const clinic = await createClinic();
      const unverified = await createInvitee({ isEmailVerified: false });
      const { membershipPublicId, invitationPublicId } = await invite(
        clinic,
        unverified.invitee.email,
      );
      const someoneElse = await createInvitee();

      for (const { inviteeToken } of [unverified, someoneElse]) {
        const response = await act({
          inviteeToken,
          invitationPublicId,
          action: 'accept',
          payload: {},
        });
        expect(response.statusCode).toBe(403);
      }
      expect((await readMembership(membershipPublicId))?.status).toBe('invited');
    });
  });

  describe('POST …/decline (ROUTE #174)', () => {
    it('ends the membership as declined, tells the inviter, and the invitation cannot be accepted after', async () => {
      const clinic = await createClinic();
      const { invitee, inviteeToken } = await createInvitee();
      const { membershipPublicId, invitationPublicId } = await invite(clinic, invitee.email);

      const declined = await act({ inviteeToken, invitationPublicId, action: 'decline' });

      expect(declined.statusCode).toBe(200);
      const body = declined.json() as {
        data: { id: string; revoked_at: string | null; organization_id: string };
      };
      expect(body.data).toMatchObject({
        id: invitationPublicId,
        organization_id: clinic.organization.public_id,
      });
      expect(body.data.revoked_at).not.toBeNull();
      const membership = await readMembership(membershipPublicId);
      expect(membership?.deleted_at).not.toBeNull();
      expect(membership?.delete_reason).toBe('declined');

      const notices = await getOperatorDatabase()
        .select({ user_id: notifications.user_id, message: notifications.message })
        .from(notifications)
        .where(eq(notifications.type, 'membership.invite_declined'));
      expect(notices).toEqual([
        {
          user_id: clinic.admin.id,
          message: expect.stringContaining('declined your invitation to join Skin Studio Adajan'),
        },
      ]);

      const acceptAfter = await act({
        inviteeToken,
        invitationPublicId,
        action: 'accept',
        payload: {},
      });
      expect(acceptAfter.statusCode).toBe(404);
    });

    it('declines an expired invitation too', async () => {
      const clinic = await createClinic();
      const { invitee, inviteeToken } = await createInvitee();
      const { membershipPublicId, invitationPublicId } = await invite(clinic, invitee.email);
      await ageInvitation({ invitationPublicId, createdDaysAgo: 10, expiredDaysAgo: 2 });

      const declined = await act({ inviteeToken, invitationPublicId, action: 'decline' });

      expect(declined.statusCode).toBe(200);
      expect((await readMembership(membershipPublicId))?.delete_reason).toBe('declined');
    });

    it('refuses an unverified email and another person, and the invitation stays pending', async () => {
      const clinic = await createClinic();
      const unverified = await createInvitee({ isEmailVerified: false });
      const { membershipPublicId, invitationPublicId } = await invite(
        clinic,
        unverified.invitee.email,
      );
      const someoneElse = await createInvitee();

      for (const { inviteeToken } of [unverified, someoneElse]) {
        const response = await act({ inviteeToken, invitationPublicId, action: 'decline' });
        expect(response.statusCode).toBe(403);
      }
      const membership = await readMembership(membershipPublicId);
      expect(membership?.status).toBe('invited');
      expect(membership?.deleted_at).toBeNull();
    });
  });

  describe('the expiry sweep (ROUTE #175)', () => {
    it('ends invited memberships 7 days past their invitation’s expiry and leaves the rest', async () => {
      const due = await createInvitee();
      const notYetDue = await createInvitee();
      const accepted = await createInvitee();
      const dueInvitation = await invite(await createClinic(), due.invitee.email);
      const notYetDueInvitation = await invite(await createClinic(), notYetDue.invitee.email);
      const acceptedInvitation = await invite(await createClinic(), accepted.invitee.email);
      expect(
        (
          await act({
            inviteeToken: accepted.inviteeToken,
            invitationPublicId: acceptedInvitation.invitationPublicId,
            action: 'accept',
            payload: {},
          })
        ).statusCode,
      ).toBe(200);
      await ageInvitation({
        invitationPublicId: dueInvitation.invitationPublicId,
        createdDaysAgo: 20,
        expiredDaysAgo: 8,
      });
      await ageInvitation({
        invitationPublicId: notYetDueInvitation.invitationPublicId,
        createdDaysAgo: 20,
        expiredDaysAgo: 6,
      });
      await ageInvitation({
        invitationPublicId: acceptedInvitation.invitationPublicId,
        createdDaysAgo: 20,
        expiredDaysAgo: 8,
      });

      const result = await runMembershipInvitationExpiryJob(app.tenancyDomain.membershipService);

      expect(result).toEqual({ scanned: 1, ended: 1, skipped: 0, failed: 0 });
      const ended = await readMembership(dueInvitation.membershipPublicId);
      expect(ended?.deleted_at).not.toBeNull();
      expect(ended?.delete_reason).toBe('invitation_expired');
      expect((await readMembership(notYetDueInvitation.membershipPublicId))?.status).toBe(
        'invited',
      );
      expect((await readMembership(acceptedInvitation.membershipPublicId))?.status).toBe('active');

      // Safe to run twice: nothing is left due.
      expect(await runMembershipInvitationExpiryJob(app.tenancyDomain.membershipService)).toEqual({
        scanned: 0,
        ended: 0,
        skipped: 0,
        failed: 0,
      });
    });
  });
});
