import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/domains/tenancy/sub-domains/permission/permission-cache.service.js', () => ({
  invalidatePermissions: vi.fn().mockResolvedValue(undefined),
  invalidateOrganizationPermissions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/domains/tenancy/sub-domains/permission/assert-grantable-permissions.util.js', () => ({
  assertCallerCanGrantPermissionCodes: vi.fn().mockResolvedValue(undefined),
  assertCallerHoldsMemberPermissionCodes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/utils/text/email.util.js', () => ({
  isDisposableEmailBlocked: vi.fn().mockReturnValue(false),
}));

// The seat-availability check acquires a per-organization advisory lock (real DB in production). Mock only
// the lock (keep RESOURCE_QUOTA_LOCK_NAMESPACE) so the seat logic runs without a live connection.
vi.mock('@/infrastructure/database/resource-quota-lock.util.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/infrastructure/database/resource-quota-lock.util.js')
  >()),
  acquireResourceQuotaLock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Blanket maintenance passthrough: services this suite touches (directly or via
    // cross-domain imports) may enter maintenance contexts (tombstoning, admin reads) —
    // the real wrapper opens a database.transaction() and CI's unit lane has no Postgres.
    withMaintenanceDatabaseContext: vi.fn(
      async ({ scope: _scope, callback }: { scope: unknown; callback: () => Promise<unknown> }) =>
        callback(),
    ),
    withAppDatabaseContext: vi.fn(
      async ({ scope: _scope, callback }: { scope: unknown; callback: () => Promise<unknown> }) =>
        callback(),
    ),
  };
});
import { ConfigurationError, NotFoundError } from '@/shared/errors/index.js';
import {
  MembershipService,
  type MembershipLeavePort,
} from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { MemberRoleService } from '@/domains/tenancy/sub-domains/member-roles/member-role.service.js';
import type { MemberRolePermissionService } from '@/domains/tenancy/sub-domains/member-roles/member-role-permission/member-role-permission.service.js';
import type { MembershipRepository } from '@/domains/tenancy/sub-domains/membership/membership.repository.js';
import type { UserService } from '@/domains/user/user.service.js';
import type { MembershipInvitationService } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.service.js';
import {
  emptyMembershipAdditionalRolesRepository,
  membershipRowFixture,
} from '@/domains/tenancy/__tests__/factories/membership-row.factory.js';
import { invalidatePermissions } from '@/domains/tenancy/sub-domains/permission/permission-cache.service.js';
import {
  MAINTENANCE_SCOPE,
  withAppDatabaseContext,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';

const organization = { id: 1, public_id: 'org_public', owner_user_id: 99 };
const role = { id: 2, public_id: 'role_public', name: 'Admin' };
/** The invitee's membership while the invite is open. */
const invitedRow = membershipRowFixture({ status: 'invited', joined_at: null });
/** The same membership once the leave step ended it. */
const endedRow = membershipRowFixture({
  status: 'invited',
  joined_at: null,
  deleted_at: new Date('2026-05-02T00:00:00.000Z'),
  delete_reason: 'declined',
});
const invitationRow = {
  id: 100,
  public_id: 'inv_public',
  membership_id: 3,
  email: 'invitee@example.com',
  token_hash: 'hashed',
  invited_by_user_id: 20,
  expires_at: new Date('2026-05-01T00:00:00.000Z'),
  accepted_at: null,
  revoked_at: new Date('2026-05-02T00:00:00.000Z'),
  created_at: new Date('2026-04-01T00:00:00.000Z'),
};
const lookup = {
  organization_public_id: 'org_public',
  organization_id: 1,
  membership_id: 3,
  membership_public_id: 'mem_public',
};

describe('MembershipService — the invitation endings and a departing login (launch D84, K6)', () => {
  const organizationService = {
    requireOrganizationRecordByPublicId: vi.fn().mockResolvedValue(organization),
    findOrganizationByPublicId: vi.fn().mockResolvedValue({ id: 1, public_id: 'org_public' }),
    resolveUserInternalIdByPublicId: vi.fn().mockResolvedValue(10),
    resolveUserPublicIdByInternalId: vi.fn().mockResolvedValue('user_public'),
  } as unknown as OrganizationService;

  const memberRoleService = {
    requireRoleRecordForOrganization: vi.fn().mockResolvedValue(role),
  } as unknown as MemberRoleService;

  const memberRolePermissionService = {
    listPermissionCodesForRole: vi.fn().mockResolvedValue(['organization:read']),
  } as unknown as MemberRolePermissionService;

  const membershipRepository = {
    findByPublicId: vi.fn().mockResolvedValue(invitedRow),
    softDelete: vi.fn().mockResolvedValue(endedRow),
    listForDepartingUser: vi.fn().mockResolvedValue([]),
    resolveUserSummariesByInternalIds: vi.fn(
      async (ids: readonly number[]) =>
        new Map(
          ids.map((id) => [
            id,
            {
              public_id: `user_public_${id}`,
              email: `user${id}@example.com`,
              first_name: 'Test',
              last_name: `User${id}`,
              avatar_url: null,
            },
          ]),
        ),
    ),
    resolveRoleSummariesByInternalIds: vi.fn(
      async (ids: readonly number[]) =>
        new Map(ids.map((id) => [id, { public_id: `role_public_${id}`, name: 'Admin' }])),
    ),
    resolveLiveInvitationsByMembershipIds: vi.fn(async () => new Map()),
  } as unknown as MembershipRepository;

  const authorizationService = {
    resolveUserOrganizationPermissions: vi.fn().mockResolvedValue([]),
  } as never;
  const permissionRepository = {
    findAll: vi.fn().mockResolvedValue([]),
  } as never;

  const userService = {
    findOrCreateInvitedByEmail: vi.fn(),
  } as unknown as UserService;

  const membershipInvitationService = {
    resolveInviteeAndOrganization: vi.fn().mockResolvedValue({
      invitee: { email: 'invitee@example.com', first_name: 'Ann', last_name: 'Lee' },
      lookup,
    }),
    revokeForInvitee: vi.fn().mockResolvedValue(invitationRow),
    revokeExpiredForMembership: vi.fn().mockResolvedValue(invitationRow),
    notifyDeclined: vi.fn().mockResolvedValue(undefined),
  } as unknown as MembershipInvitationService;

  const membershipAdditionalRolesRepository = emptyMembershipAdditionalRolesRepository();

  const leaveStep: MembershipLeavePort = {
    releaseEndedMembership: vi.fn().mockResolvedValue(undefined),
  };
  const enqueueSeatQuantitySync = vi.fn();

  const service = new MembershipService(
    organizationService,
    memberRoleService,
    memberRolePermissionService,
    membershipRepository,
    authorizationService,
    permissionRepository,
    undefined,
    undefined,
    undefined,
    undefined,
    userService,
    membershipInvitationService,
    membershipAdditionalRolesRepository,
  );
  service.wireLeaveStep(leaveStep);
  service.wireSeatEnforcement({
    reserveSeatCeilingForMemberAdd: vi.fn().mockResolvedValue(null),
    enqueueSeatQuantitySync,
  });

  /** A harness that left the invitation service out. */
  const bareService = new MembershipService(
    organizationService,
    memberRoleService,
    memberRolePermissionService,
    membershipRepository,
    authorizationService,
    permissionRepository,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(organizationService.requireOrganizationRecordByPublicId).mockResolvedValue(
      organization as never,
    );
    vi.mocked(organizationService.findOrganizationByPublicId).mockResolvedValue({
      id: 1,
      public_id: 'org_public',
    } as never);
    vi.mocked(organizationService.resolveUserPublicIdByInternalId).mockResolvedValue('user_public');
    vi.mocked(membershipRepository.findByPublicId).mockResolvedValue(invitedRow as never);
    vi.mocked(membershipRepository.softDelete).mockResolvedValue(endedRow as never);
    vi.mocked(membershipInvitationService.resolveInviteeAndOrganization).mockResolvedValue({
      invitee: { email: 'invitee@example.com', first_name: 'Ann', last_name: 'Lee' },
      lookup,
    });
    vi.mocked(membershipInvitationService.revokeForInvitee).mockResolvedValue(
      invitationRow as never,
    );
    vi.mocked(membershipInvitationService.revokeExpiredForMembership).mockResolvedValue(
      invitationRow as never,
    );
  });

  describe('declineInvitation (ROUTE #174)', () => {
    const declineInput = { invitationPublicId: 'inv_public', actingUserPublicId: 'invitee_public' };

    it('revokes the invite, ends the invited membership as declined and tells the inviter — in the inviting organization', async () => {
      const result = await service.declineInvitation(declineInput);
      expect(membershipInvitationService.resolveInviteeAndOrganization).toHaveBeenCalledWith({
        invitation_public_id: 'inv_public',
        actingUserPublicId: 'invitee_public',
      });
      // The invitee is no member there yet: the organization comes from the lookup, as a verified scope.
      expect(withAppDatabaseContext).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({ organizationPublicId: 'org_public' }),
        }),
      );
      expect(membershipInvitationService.revokeForInvitee).toHaveBeenCalledWith({
        invitation_public_id: 'inv_public',
        inviteeEmail: 'invitee@example.com',
      });
      expect(membershipRepository.findByPublicId).toHaveBeenCalledWith(
        'mem_public',
        organization.id,
      );
      expect(membershipRepository.softDelete).toHaveBeenCalledWith('mem_public', organization.id, {
        delete_reason: 'declined',
        delete_note: null,
      });
      expect(leaveStep.releaseEndedMembership).toHaveBeenCalledWith({
        organizationId: organization.id,
        membershipId: endedRow.id,
      });
      expect(membershipInvitationService.notifyDeclined).toHaveBeenCalledWith({
        invitation: invitationRow,
        organizationId: 1,
        organizationPublicId: 'org_public',
        inviteeUserId: endedRow.user_id,
        inviteeName: 'Ann Lee',
      });
      // After the commit: the invitee's cached permissions and the freed seat.
      expect(invalidatePermissions).toHaveBeenCalledWith({
        userId: 'user_public',
        organizationId: 'org_public',
      });
      expect(enqueueSeatQuantitySync).toHaveBeenCalledWith({
        organization_public_id: 'org_public',
      });
      expect(result).toEqual({
        id: 'inv_public',
        membership_id: 'mem_public',
        email: 'invitee@example.com',
        expires_at: '2026-05-01T00:00:00.000Z',
        accepted_at: null,
        revoked_at: '2026-05-02T00:00:00.000Z',
        created_at: '2026-04-01T00:00:00.000Z',
        organization_id: 'org_public',
      });
    });

    it.each([
      ['their first name alone', { first_name: 'Ann', last_name: null }, 'Ann'],
      [
        'their email when they have no name',
        { first_name: null, last_name: null },
        'invitee@example.com',
      ],
      ['their last name trimmed', { first_name: null, last_name: ' Lee ' }, 'Lee'],
    ])('names the invitee to the inviter by %s', async (_label, names, expectedName) => {
      vi.mocked(membershipInvitationService.resolveInviteeAndOrganization).mockResolvedValueOnce({
        invitee: { email: 'invitee@example.com', ...names },
        lookup,
      });
      await service.declineInvitation(declineInput);
      expect(membershipInvitationService.notifyDeclined).toHaveBeenCalledWith(
        expect.objectContaining({ inviteeName: expectedName }),
      );
    });

    it('is a 404 once the membership is no longer invited (accepted meanwhile) — nothing ended or told', async () => {
      vi.mocked(membershipRepository.findByPublicId).mockResolvedValueOnce(
        membershipRowFixture({ status: 'active' }),
      );
      await expect(service.declineInvitation(declineInput)).rejects.toMatchObject({
        name: 'NotFoundError',
        messageParams: { resource: 'Membership invitation' },
      });
      expect(membershipRepository.softDelete).not.toHaveBeenCalled();
      expect(membershipInvitationService.notifyDeclined).not.toHaveBeenCalled();
      expect(invalidatePermissions).not.toHaveBeenCalled();
      expect(enqueueSeatQuantitySync).not.toHaveBeenCalled();
    });

    it('is a 404 when the membership is already gone', async () => {
      vi.mocked(membershipRepository.findByPublicId).mockResolvedValueOnce(null);
      await expect(service.declineInvitation(declineInput)).rejects.toBeInstanceOf(NotFoundError);
      expect(leaveStep.releaseEndedMembership).not.toHaveBeenCalled();
    });

    it('is a 404 when the leave step refuses the end', async () => {
      vi.mocked(membershipRepository.softDelete).mockResolvedValueOnce(null);
      await expect(service.declineInvitation(declineInput)).rejects.toBeInstanceOf(NotFoundError);
      expect(leaveStep.releaseEndedMembership).not.toHaveBeenCalled();
      expect(membershipInvitationService.notifyDeclined).not.toHaveBeenCalled();
    });

    it('surfaces the invitation refusal before touching the membership', async () => {
      const refusal = new NotFoundError('Membership invitation');
      vi.mocked(membershipInvitationService.revokeForInvitee).mockRejectedValueOnce(refusal);
      await expect(service.declineInvitation(declineInput)).rejects.toBe(refusal);
      expect(membershipRepository.softDelete).not.toHaveBeenCalled();
    });

    it('is a ConfigurationError in a harness without the invitation service', async () => {
      await expect(bareService.declineInvitation(declineInput)).rejects.toBeInstanceOf(
        ConfigurationError,
      );
    });
  });

  describe('endExpiredInvitation (ROUTE #175 — the expiry sweep)', () => {
    const expiredBefore = new Date('2026-05-10T00:00:00.000Z');
    const sweepInput = {
      organizationPublicId: 'org_public',
      membershipPublicId: 'mem_public',
      expiredBefore,
    };

    it('revokes the long-expired invite, ends the membership as invitation_expired and frees the seat', async () => {
      await expect(service.endExpiredInvitation(sweepInput)).resolves.toBe(true);
      expect(organizationService.findOrganizationByPublicId).toHaveBeenCalledWith('org_public');
      expect(membershipInvitationService.revokeExpiredForMembership).toHaveBeenCalledWith({
        membership_id: invitedRow.id,
        expiredBefore,
      });
      expect(membershipRepository.softDelete).toHaveBeenCalledWith('mem_public', organization.id, {
        delete_reason: 'invitation_expired',
        delete_note: null,
      });
      expect(leaveStep.releaseEndedMembership).toHaveBeenCalledWith({
        organizationId: organization.id,
        membershipId: endedRow.id,
      });
      expect(invalidatePermissions).toHaveBeenCalledWith({
        userId: 'user_public',
        organizationId: 'org_public',
      });
      expect(enqueueSeatQuantitySync).toHaveBeenCalledWith({
        organization_public_id: 'org_public',
      });
    });

    it('skips an organization that is gone, before any read in its context', async () => {
      vi.mocked(organizationService.findOrganizationByPublicId).mockResolvedValueOnce(null);
      await expect(service.endExpiredInvitation(sweepInput)).resolves.toBe(false);
      expect(organizationService.requireOrganizationRecordByPublicId).not.toHaveBeenCalled();
      expect(membershipRepository.findByPublicId).not.toHaveBeenCalled();
      expect(enqueueSeatQuantitySync).not.toHaveBeenCalled();
    });

    it.each([
      [
        'the membership is already active (accepted meanwhile)',
        membershipRowFixture({ status: 'active' }),
      ],
      ['the membership is already ended', null],
    ])('skips when %s, revoking nothing', async (_label, membership) => {
      vi.mocked(membershipRepository.findByPublicId).mockResolvedValueOnce(membership);
      await expect(service.endExpiredInvitation(sweepInput)).resolves.toBe(false);
      expect(membershipInvitationService.revokeExpiredForMembership).not.toHaveBeenCalled();
      expect(membershipRepository.softDelete).not.toHaveBeenCalled();
    });

    it('skips when the invitation is no longer due (resent, accepted or revoked)', async () => {
      vi.mocked(membershipInvitationService.revokeExpiredForMembership).mockResolvedValueOnce(null);
      await expect(service.endExpiredInvitation(sweepInput)).resolves.toBe(false);
      expect(membershipRepository.softDelete).not.toHaveBeenCalled();
      expect(invalidatePermissions).not.toHaveBeenCalled();
    });

    it('skips when the leave step refuses the end, without purging or syncing', async () => {
      vi.mocked(membershipRepository.softDelete).mockResolvedValueOnce(null);
      await expect(service.endExpiredInvitation(sweepInput)).resolves.toBe(false);
      expect(invalidatePermissions).not.toHaveBeenCalled();
      expect(enqueueSeatQuantitySync).not.toHaveBeenCalled();
    });

    it('is a ConfigurationError in a harness without the invitation service', async () => {
      await expect(bareService.endExpiredInvitation(sweepInput)).rejects.toBeInstanceOf(
        ConfigurationError,
      );
    });
  });

  describe('removeAllForDepartingUser (launch K6 — account deletion)', () => {
    const liveTeamRow = {
      membership_public_id: 'mem_live',
      membership_deleted_at: null,
      organization_public_id: 'org_team',
      organization_type: 'TEAM',
      organization_deleted_at: null,
    };

    beforeEach(() => {
      vi.mocked(organizationService.requireOrganizationRecordByPublicId).mockResolvedValue({
        ...organization,
        public_id: 'org_team',
      } as never);
      vi.mocked(membershipRepository.findByPublicId).mockResolvedValue(
        membershipRowFixture({ public_id: 'mem_live' }),
      );
      vi.mocked(membershipRepository.softDelete).mockResolvedValue(
        membershipRowFixture({
          public_id: 'mem_live',
          deleted_at: new Date(),
          delete_reason: 'account_deleted',
        }),
      );
    });

    it('lists the rows across tenants under the retention bypass, then ends each live TEAM membership in its own organization', async () => {
      vi.mocked(membershipRepository.listForDepartingUser).mockResolvedValueOnce([liveTeamRow]);
      const result = await service.removeAllForDepartingUser(10);
      expect(withMaintenanceDatabaseContext).toHaveBeenCalledWith(
        expect.objectContaining({ scope: MAINTENANCE_SCOPE.GLOBAL_RETENTION_CLEANUP }),
      );
      expect(membershipRepository.listForDepartingUser).toHaveBeenCalledWith(10);
      expect(withAppDatabaseContext).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({ organizationPublicId: 'org_team' }),
        }),
      );
      expect(organizationService.requireOrganizationRecordByPublicId).toHaveBeenCalledWith(
        'org_team',
      );
      expect(membershipRepository.softDelete).toHaveBeenCalledWith('mem_live', organization.id, {
        delete_reason: 'account_deleted',
        delete_note: null,
      });
      expect(leaveStep.releaseEndedMembership).toHaveBeenCalledWith({
        organizationId: organization.id,
        membershipId: 3,
      });
      expect(invalidatePermissions).toHaveBeenCalledWith({
        userId: 'user_public',
        organizationId: 'org_team',
      });
      expect(enqueueSeatQuantitySync).toHaveBeenCalledWith({ organization_public_id: 'org_team' });
      expect(result).toEqual({ organizationPublicIds: ['org_team'] });
    });

    it('leaves an ended membership, a deleted organization and the personal organization alone, but still names the live ones', async () => {
      vi.mocked(membershipRepository.listForDepartingUser).mockResolvedValueOnce([
        {
          ...liveTeamRow,
          membership_public_id: 'mem_ended',
          membership_deleted_at: new Date(),
          organization_public_id: 'org_past',
        },
        {
          ...liveTeamRow,
          membership_public_id: 'mem_gone',
          organization_public_id: 'org_gone',
          organization_deleted_at: new Date(),
        },
        {
          ...liveTeamRow,
          membership_public_id: 'mem_personal',
          organization_public_id: 'org_personal',
          organization_type: 'PERSONAL',
        },
      ]);
      const result = await service.removeAllForDepartingUser(10);
      expect(membershipRepository.softDelete).not.toHaveBeenCalled();
      expect(withAppDatabaseContext).not.toHaveBeenCalled();
      expect(invalidatePermissions).not.toHaveBeenCalled();
      expect(enqueueSeatQuantitySync).not.toHaveBeenCalled();
      // The deleted organization is left out; the past and personal ones still hold the user's details.
      expect(result.organizationPublicIds).toEqual(['org_past', 'org_personal']);
    });

    it('names an organization once however many of its rows the user has', async () => {
      vi.mocked(membershipRepository.listForDepartingUser).mockResolvedValueOnce([
        { ...liveTeamRow, membership_public_id: 'mem_old', membership_deleted_at: new Date() },
        liveTeamRow,
      ]);
      const result = await service.removeAllForDepartingUser(10);
      expect(membershipRepository.softDelete).toHaveBeenCalledTimes(1);
      expect(result.organizationPublicIds).toEqual(['org_team']);
    });

    it('skips the purge and the seat sync for a membership the leave step refused', async () => {
      vi.mocked(membershipRepository.listForDepartingUser).mockResolvedValueOnce([liveTeamRow]);
      vi.mocked(membershipRepository.softDelete).mockResolvedValueOnce(null);
      const result = await service.removeAllForDepartingUser(10);
      expect(leaveStep.releaseEndedMembership).not.toHaveBeenCalled();
      expect(invalidatePermissions).not.toHaveBeenCalled();
      expect(enqueueSeatQuantitySync).not.toHaveBeenCalled();
      expect(result.organizationPublicIds).toEqual(['org_team']);
    });

    it('answers no organizations for a login that never joined one', async () => {
      await expect(service.removeAllForDepartingUser(10)).resolves.toEqual({
        organizationPublicIds: [],
      });
    });
  });
});
