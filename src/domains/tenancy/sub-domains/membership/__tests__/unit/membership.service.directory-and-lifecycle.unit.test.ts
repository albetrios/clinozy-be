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
import { ConfigurationError, NotFoundError, ValidationError } from '@/shared/errors/index.js';
import {
  MembershipService,
  type MembershipBranchAccessPort,
  type MembershipLeavePort,
} from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { OrganizationSettingsService } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.service.js';
import type { OrganizationApiKeyRepository } from '@/domains/tenancy/sub-domains/organization/organization-api-key/organization-api-key.repository.js';
import type { MemberRoleService } from '@/domains/tenancy/sub-domains/member-roles/member-role.service.js';
import type { MemberRolePermissionService } from '@/domains/tenancy/sub-domains/member-roles/member-role-permission/member-role-permission.service.js';
import type { MembershipRepository } from '@/domains/tenancy/sub-domains/membership/membership.repository.js';
import type { UserService } from '@/domains/user/user.service.js';
import type { UserSettingsService } from '@/domains/user/sub-domains/user-settings/user-settings.service.js';
import type { MembershipInvitationService } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.service.js';
import {
  emptyMembershipAdditionalRolesRepository,
  membershipRowFixture,
} from '@/domains/tenancy/__tests__/factories/membership-row.factory.js';
import { invalidatePermissions } from '@/domains/tenancy/sub-domains/permission/permission-cache.service.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
  type OrganizationPrincipalDatabaseScope,
  type UserPrincipalDatabaseScope,
} from '@/infrastructure/database/contexts/database-context.js';

const organization = { id: 1, public_id: 'org_public', owner_user_id: 99 };
const role = { id: 2, public_id: 'role_public', name: 'Admin' };
const membershipRow = membershipRowFixture({ joined_at: new Date() });
/** A removed member (D58): the row every restore and rename test starts from. */
const endedRow = membershipRowFixture({
  deleted_at: new Date('2026-03-01T00:00:00.000Z'),
  delete_reason: 'mistake',
  display_name: 'Old Name',
});

const asScope = (organizationPublicId: string) =>
  PRINCIPAL_SCOPE.REQUEST({
    organizationPublicId,
  }) as OrganizationPrincipalDatabaseScope;

/** A role summary as the SECURITY DEFINER resolver returns it (name, tone, system flag). */
const roleSummary = (id: number) => ({
  public_id: `role_public_${id}`,
  name: id === role.id ? 'Admin' : 'Doctor',
  tone: 'sky',
  is_system: id === role.id,
});

/** The duplicate-key error node-postgres raises on `idx_memberships_user_org_unique`. */
const uniqueViolation = () => Object.assign(new Error('duplicate key'), { code: '23505' });

describe('MembershipService — directory, restore, wired ports and setup reads', () => {
  const organizationService = {
    requireOrganizationRecordByPublicId: vi.fn().mockResolvedValue(organization),
    requireOrganizationByPublicId: vi.fn().mockResolvedValue({ id: 1, public_id: 'org_public' }),
    resolveUserInternalIdByPublicId: vi.fn().mockResolvedValue(10),
    resolveUserPublicIdByInternalId: vi.fn().mockResolvedValue('user_public'),
  } as unknown as OrganizationService;

  const memberRoleService = {
    requireRoleRecordByPublicId: vi.fn().mockResolvedValue(role),
    requireRoleRecordForOrganization: vi.fn().mockResolvedValue(role),
    resolveRolePublicIdByInternalId: vi.fn().mockResolvedValue('role_public'),
    resolveRolePublicIdForOrganization: vi.fn().mockResolvedValue('role_public'),
  } as unknown as MemberRoleService;

  const memberRolePermissionService = {
    listPermissionCodesForRole: vi.fn().mockResolvedValue(['organization:read']),
  } as unknown as MemberRolePermissionService;

  const membershipRepository = {
    list: vi.fn().mockResolvedValue({
      items: [membershipRow],
      total: null,
      limit: 25,
      has_more: false,
      next_cursor: null,
    }),
    findByPublicId: vi.fn().mockResolvedValue(membershipRow),
    findAnyByPublicId: vi.fn().mockResolvedValue(membershipRow),
    findDeletedByPublicId: vi.fn().mockResolvedValue(endedRow),
    findIdsByPublicIds: vi.fn().mockResolvedValue([]),
    findLatestEndedForUser: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(membershipRow),
    update: vi.fn().mockResolvedValue(membershipRow),
    renameEnded: vi.fn().mockResolvedValue(endedRow),
    restore: vi.fn().mockResolvedValue(membershipRow),
    softDelete: vi.fn().mockResolvedValue(membershipRow),
    findByUserAndOrganization: vi.fn().mockResolvedValue(membershipRow),
    summarizeTeamForSetup: vi
      .fn()
      .mockResolvedValue({ has_teammate: false, has_bookable_member: false }),
    listOrganizationsForUserDataExport: vi.fn().mockResolvedValue([]),
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
      async (ids: readonly number[]) => new Map(ids.map((id) => [id, roleSummary(id)])),
    ),
    resolveLiveInvitationsByMembershipIds: vi.fn(async () => new Map()),
    countActiveByOrganization: vi.fn().mockResolvedValue(0),
  } as unknown as MembershipRepository;

  const authorizationService = {
    resolveUserOrganizationPermissions: vi.fn().mockResolvedValue([]),
  } as never;
  const permissionRepository = {
    findAll: vi.fn().mockResolvedValue([]),
  } as never;

  const userService = {
    findOrCreateInvitedByEmail: vi.fn().mockResolvedValue({
      id: 10,
      public_id: 'user_public',
      email: 'invitee@example.com',
    }),
  } as unknown as UserService;

  const membershipInvitationService = {
    createForMembership: vi.fn().mockResolvedValue({ id: 'inv_public' }),
    revokePendingForMembership: vi.fn().mockResolvedValue({ public_id: 'inv_public' }),
  } as unknown as MembershipInvitationService;

  // The organization's default language reaches a new member still on the factory locale.
  const organizationSettingsService = {
    resolveDefaultLocaleForOrganization: vi.fn().mockResolvedValue('es'),
  } as unknown as OrganizationSettingsService;
  const userSettingsService = {
    getForInvitedUser: vi.fn().mockResolvedValue({ language: 'en', preferred_locales: ['en'] }),
    updateForInvitedUser: vi.fn().mockResolvedValue(undefined),
  } as unknown as UserSettingsService;

  // reaudit-#7: a departed member's API keys are revoked in the same leave step.
  const organizationApiKeyRepository = {
    revokeAllByCreatorInOrganization: vi.fn().mockResolvedValue(undefined),
  } as unknown as OrganizationApiKeyRepository;

  // D5: the roles a member holds besides the main one — none here.
  const membershipAdditionalRolesRepository = emptyMembershipAdditionalRolesRepository();

  // Launch ROUTE #4 / K4: the app domain's ports, late-wired by the composition root.
  const branchAccess: MembershipBranchAccessPort = {
    listBranchPublicIdsByMembershipIds: vi.fn(async () => new Map([[3, ['bra_one']]])),
    listMembershipIdsAtBranch: vi.fn().mockResolvedValue([3, 4]),
    replaceBranchesForMembership: vi.fn().mockResolvedValue(undefined),
  };
  const leaveStep: MembershipLeavePort = {
    releaseEndedMembership: vi.fn().mockResolvedValue(undefined),
  };
  const reserveSeatCeilingForMemberAdd = vi.fn().mockResolvedValue(null);
  const enqueueSeatQuantitySync = vi.fn();

  /** The minimal harness: no ports wired, as the existing lifecycle suite builds it. */
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

  /** The container's wiring: locale defaults, API keys, branch access, the leave step, seats. */
  const wiredService = new MembershipService(
    organizationService,
    memberRoleService,
    memberRolePermissionService,
    membershipRepository,
    authorizationService,
    permissionRepository,
    organizationSettingsService,
    userSettingsService,
    organizationApiKeyRepository,
    undefined,
    userService,
    membershipInvitationService,
    membershipAdditionalRolesRepository,
  );
  wiredService.wireBranchAccess(branchAccess);
  wiredService.wireLeaveStep(leaveStep);
  wiredService.wireSeatEnforcement({ reserveSeatCeilingForMemberAdd, enqueueSeatQuantitySync });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(organizationService.requireOrganizationRecordByPublicId).mockResolvedValue(
      organization as never,
    );
    vi.mocked(organizationService.resolveUserInternalIdByPublicId).mockResolvedValue(10);
    vi.mocked(organizationService.resolveUserPublicIdByInternalId).mockResolvedValue('user_public');
    vi.mocked(memberRoleService.requireRoleRecordForOrganization).mockResolvedValue(role as never);
    vi.mocked(membershipRepository.findByPublicId).mockResolvedValue(membershipRow as never);
    vi.mocked(membershipRepository.findAnyByPublicId).mockResolvedValue(membershipRow as never);
    vi.mocked(membershipRepository.findDeletedByPublicId).mockResolvedValue(endedRow as never);
    vi.mocked(membershipRepository.findByUserAndOrganization).mockResolvedValue(
      membershipRow as never,
    );
    vi.mocked(membershipRepository.update).mockResolvedValue(membershipRow as never);
    vi.mocked(membershipRepository.renameEnded).mockResolvedValue(endedRow as never);
    vi.mocked(membershipRepository.restore).mockResolvedValue(membershipRow as never);
    vi.mocked(membershipRepository.softDelete).mockResolvedValue(membershipRow as never);
    vi.mocked(membershipRepository.countActiveByOrganization).mockResolvedValue(0);
    vi.mocked(membershipAdditionalRolesRepository.listRoleIdsForMembership).mockResolvedValue([]);
    vi.mocked(branchAccess.listMembershipIdsAtBranch).mockResolvedValue([3, 4]);
    vi.mocked(userSettingsService.getForInvitedUser).mockResolvedValue({
      language: 'en',
      preferred_locales: ['en'],
    } as never);
    reserveSeatCeilingForMemberAdd.mockResolvedValue(null);
  });

  describe('listDirectory (launch §2.A route 1, K5)', () => {
    const directoryQuery = { includeEnded: false, limit: 25 };

    it('lists live active members by name, passing the picker filters to one keyset read', async () => {
      const result = await wiredService.listDirectory({
        scope: asScope('org_public'),
        query: {
          ...directoryQuery,
          q: 'ann',
          publicIds: ['mem_public'],
          holdsPermissionCode: 'task:assign',
          after: 'cursor_after',
        },
      });
      expect(membershipRepository.list).toHaveBeenCalledWith(organization.id, {
        after: 'cursor_after',
        limit: 25,
        q: 'ann',
        sort: 'name',
        order: 'asc',
        publicIds: ['mem_public'],
        holdsPermissionCode: 'task:assign',
        statuses: ['active'],
        includeEnded: false,
      });
      expect(result).toMatchObject({ total: null, limit: 25, has_more: false, next_cursor: null });
      // The page is serialized like the team list: public ids only, branches from the app's port.
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: 'mem_public',
        organization_id: 'org_public',
        role_ids: ['role_public_2'],
        branch_ids: ['bra_one'],
        user: { id: 'user_public_10', email: 'user10@example.com' },
      });
      expect(branchAccess.listBranchPublicIdsByMembershipIds).toHaveBeenCalledWith({
        membershipIds: [membershipRow.id],
      });
    });

    it('with includeEnded lists every membership — any status, live or ended', async () => {
      await service.listDirectory({
        scope: asScope('org_public'),
        query: { includeEnded: true, limit: 10 },
      });
      const [, listQuery] = vi.mocked(membershipRepository.list).mock.calls[0]!;
      expect(listQuery).toMatchObject({ includeEnded: true, limit: 10, sort: 'name' });
      expect(listQuery.statuses).toBeUndefined();
    });

    it('narrows to a role by its public id', async () => {
      await service.listDirectory({
        scope: asScope('org_public'),
        query: { ...directoryQuery, rolePublicId: 'role_public' },
      });
      expect(memberRoleService.requireRoleRecordForOrganization).toHaveBeenCalledWith({
        organization_id: organization.id,
        role_public_id: 'role_public',
      });
      expect(membershipRepository.list).toHaveBeenCalledWith(
        organization.id,
        expect.objectContaining({ roleId: role.id }),
      );
    });

    it('an unknown role is an empty page, never a 400 and never a read', async () => {
      vi.mocked(memberRoleService.requireRoleRecordForOrganization).mockRejectedValueOnce(
        new NotFoundError('Role'),
      );
      const result = await service.listDirectory({
        scope: asScope('org_public'),
        query: { ...directoryQuery, rolePublicId: 'role_unknown' },
      });
      expect(result).toEqual({
        items: [],
        total: null,
        limit: 25,
        has_more: false,
        next_cursor: null,
      });
      expect(membershipRepository.list).not.toHaveBeenCalled();
    });

    it('any other failure resolving the role propagates', async () => {
      vi.mocked(memberRoleService.requireRoleRecordForOrganization).mockRejectedValueOnce(
        new Error('role lookup failed'),
      );
      await expect(
        service.listDirectory({
          scope: asScope('org_public'),
          query: { ...directoryQuery, rolePublicId: 'role_public' },
        }),
      ).rejects.toThrow('role lookup failed');
    });

    it('narrows to the members who work at a branch through the app port (T2)', async () => {
      await wiredService.listDirectory({
        scope: asScope('org_public'),
        query: { ...directoryQuery, branchPublicId: 'bra_one' },
      });
      expect(branchAccess.listMembershipIdsAtBranch).toHaveBeenCalledWith({
        organizationId: organization.id,
        branchPublicId: 'bra_one',
      });
      expect(membershipRepository.list).toHaveBeenCalledWith(
        organization.id,
        expect.objectContaining({ membershipIds: [3, 4] }),
      );
    });

    it('an unknown branch is an empty page', async () => {
      vi.mocked(branchAccess.listMembershipIdsAtBranch).mockResolvedValueOnce(null);
      const result = await wiredService.listDirectory({
        scope: asScope('org_public'),
        query: { ...directoryQuery, branchPublicId: 'bra_unknown' },
      });
      expect(result.items).toEqual([]);
      expect(result.limit).toBe(25);
      expect(membershipRepository.list).not.toHaveBeenCalled();
    });

    it('a branch filter without the app port wired is an empty page too', async () => {
      const result = await service.listDirectory({
        scope: asScope('org_public'),
        query: { ...directoryQuery, branchPublicId: 'bra_one' },
      });
      expect(result.items).toEqual([]);
      expect(membershipRepository.list).not.toHaveBeenCalled();
    });

    it('throws when the organization is missing', async () => {
      vi.mocked(organizationService.requireOrganizationRecordByPublicId).mockRejectedValueOnce(
        new NotFoundError('Organization'),
      );
      await expect(
        service.listDirectory({ scope: asScope('org_missing'), query: directoryQuery }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('resolveMembershipIdsByPublicIds (another domain storing a membership key)', () => {
    it('resolves the live ids in one lookup, collapsing duplicates', async () => {
      vi.mocked(membershipRepository.findIdsByPublicIds).mockResolvedValueOnce([
        { id: 3, public_id: 'mem_public' },
        { id: 4, public_id: 'mem_other' },
      ]);
      const resolved = await service.resolveMembershipIdsByPublicIds({
        organizationId: organization.id,
        membershipPublicIds: ['mem_public', 'mem_other', 'mem_public'],
      });
      expect(membershipRepository.findIdsByPublicIds).toHaveBeenCalledWith(organization.id, [
        'mem_public',
        'mem_other',
      ]);
      expect([...resolved.entries()]).toEqual([
        ['mem_public', 3],
        ['mem_other', 4],
      ]);
    });

    it('leaves an unknown id out of the map rather than raising', async () => {
      vi.mocked(membershipRepository.findIdsByPublicIds).mockResolvedValueOnce([]);
      const resolved = await service.resolveMembershipIdsByPublicIds({
        organizationId: organization.id,
        membershipPublicIds: ['mem_unknown'],
      });
      expect(resolved.size).toBe(0);
    });
  });

  describe('update on an ended member — the rename (K6, D58)', () => {
    beforeEach(() => {
      vi.mocked(membershipRepository.findAnyByPublicId).mockResolvedValue(endedRow as never);
    });

    it('renames the ended membership and answers the renamed row', async () => {
      vi.mocked(membershipRepository.renameEnded).mockResolvedValueOnce({
        ...endedRow,
        display_name: 'Former member',
      });
      const result = await service.update({
        scope: asScope('org_public'),
        membership_public_id: 'mem_public',
        body: { display_name: 'Former member' },
        updated_by_user_public_id: 'updater_public',
      });
      expect(membershipRepository.renameEnded).toHaveBeenCalledWith({
        publicId: 'mem_public',
        organizationId: organization.id,
        displayName: 'Former member',
        updatedByUserId: 10,
      });
      expect(result).toMatchObject({
        id: 'mem_public',
        display_name: 'Former member',
        ended_at: '2026-03-01T00:00:00.000Z',
        end_reason: 'mistake',
      });
      // The live-member write never runs for an ended row.
      expect(membershipRepository.update).not.toHaveBeenCalled();
    });

    it('accepts expected_updated_at beside the name (T14) and records no updater when unresolved', async () => {
      vi.mocked(organizationService.resolveUserInternalIdByPublicId).mockResolvedValueOnce(null);
      await service.update({
        scope: asScope('org_public'),
        membership_public_id: 'mem_public',
        body: {
          display_name: 'Former member',
          expected_updated_at: endedRow.updated_at.toISOString(),
        },
        updated_by_user_public_id: 'gone_public',
      });
      expect(membershipRepository.renameEnded).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Former member', updatedByUserId: null }),
      );
    });

    it('refuses any other field with membership_ended, naming the fields', async () => {
      await expect(
        service.update({
          scope: asScope('org_public'),
          membership_public_id: 'mem_public',
          body: { display_name: 'Former member', status: 'suspended' },
          updated_by_user_public_id: 'updater_public',
        }),
      ).rejects.toMatchObject({
        messageKey: 'errors:validation.membershipEnded',
        reason: 'membership_ended',
        errors: [{ field: 'status', messageKey: 'errors:validation.membershipEnded' }],
      });
      expect(membershipRepository.renameEnded).not.toHaveBeenCalled();
    });

    it('is a ValidationError, not a 403, for a status change on an ended member', async () => {
      await expect(
        service.update({
          scope: asScope('org_public'),
          membership_public_id: 'mem_public',
          body: { status: 'active' },
          updated_by_user_public_id: 'updater_public',
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('names display_name when the body carries nothing to rename with', async () => {
      await expect(
        service.update({
          scope: asScope('org_public'),
          membership_public_id: 'mem_public',
          body: { display_name: undefined, expected_updated_at: endedRow.updated_at.toISOString() },
          updated_by_user_public_id: 'updater_public',
        }),
      ).rejects.toMatchObject({
        reason: 'membership_ended',
        errors: [{ field: 'display_name' }],
      });
    });

    it('throws NotFoundError when the rename matches no row', async () => {
      vi.mocked(membershipRepository.renameEnded).mockResolvedValueOnce(null);
      await expect(
        service.update({
          scope: asScope('org_public'),
          membership_public_id: 'mem_public',
          body: { display_name: 'Former member' },
          updated_by_user_public_id: 'updater_public',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('restore (RC-144 — undo a removal)', () => {
    const restoreInput = {
      scope: asScope('org_public'),
      membership_public_id: 'mem_public',
      restored_by_user_public_id: 'restorer_public',
    };

    it('clears the removal, re-checks the seat, purges the cache and reconciles the seat count', async () => {
      reserveSeatCeilingForMemberAdd.mockResolvedValueOnce(5);
      vi.mocked(membershipRepository.countActiveByOrganization).mockResolvedValueOnce(2);
      const result = await wiredService.restore(restoreInput);
      expect(membershipRepository.findDeletedByPublicId).toHaveBeenCalledWith(
        'mem_public',
        organization.id,
      );
      expect(reserveSeatCeilingForMemberAdd).toHaveBeenCalledWith(organization.id);
      expect(membershipRepository.restore).toHaveBeenCalledWith('mem_public', organization.id, 10);
      expect(result).toMatchObject({ id: 'mem_public', status: 'active', ended_at: null });
      expect(invalidatePermissions).toHaveBeenCalledWith({
        userId: 'user_public',
        organizationId: 'org_public',
      });
      expect(enqueueSeatQuantitySync).toHaveBeenCalledWith({
        organization_public_id: 'org_public',
      });
    });

    it('refuses with seat_limit_reached when no seat is free, writing nothing', async () => {
      reserveSeatCeilingForMemberAdd.mockResolvedValueOnce(3);
      vi.mocked(membershipRepository.countActiveByOrganization).mockResolvedValueOnce(3);
      await expect(wiredService.restore(restoreInput)).rejects.toMatchObject({
        name: 'ConflictError',
        reason: 'seat_limit_reached',
        messageParams: { used: 3, limit: 3 },
      });
      expect(membershipRepository.restore).not.toHaveBeenCalled();
      expect(enqueueSeatQuantitySync).not.toHaveBeenCalled();
    });

    it('skips the seat check and the seat sync for a suspended row (it takes no seat)', async () => {
      vi.mocked(membershipRepository.findDeletedByPublicId).mockResolvedValueOnce({
        ...endedRow,
        status: 'suspended',
      });
      vi.mocked(membershipRepository.restore).mockResolvedValueOnce({
        ...membershipRow,
        status: 'suspended',
      });
      const result = await wiredService.restore(restoreInput);
      expect(reserveSeatCeilingForMemberAdd).not.toHaveBeenCalled();
      expect(enqueueSeatQuantitySync).not.toHaveBeenCalled();
      expect(result.status).toBe('suspended');
      expect(invalidatePermissions).toHaveBeenCalledTimes(1);
    });

    it('records no restorer when the acting user cannot be resolved', async () => {
      vi.mocked(organizationService.resolveUserInternalIdByPublicId).mockResolvedValueOnce(null);
      await service.restore({ ...restoreInput, restored_by_user_public_id: undefined });
      expect(membershipRepository.restore).toHaveBeenCalledWith(
        'mem_public',
        organization.id,
        null,
      );
    });

    it('is a 409 membership_not_deleted for a live member', async () => {
      vi.mocked(membershipRepository.findDeletedByPublicId).mockResolvedValueOnce(null);
      await expect(service.restore(restoreInput)).rejects.toMatchObject({
        name: 'ConflictError',
        messageKey: 'errors:membershipNotDeleted',
        reason: 'membership_not_deleted',
      });
      expect(membershipRepository.restore).not.toHaveBeenCalled();
    });

    it('is a 404 when the member is neither removed nor live here', async () => {
      vi.mocked(membershipRepository.findDeletedByPublicId).mockResolvedValueOnce(null);
      vi.mocked(membershipRepository.findByPublicId).mockResolvedValueOnce(null);
      await expect(service.restore(restoreInput)).rejects.toBeInstanceOf(NotFoundError);
      expect(membershipRepository.restore).not.toHaveBeenCalled();
    });

    it('is a 409 membership_already_exists when the person is a live member again', async () => {
      vi.mocked(membershipRepository.restore).mockRejectedValueOnce(uniqueViolation());
      await expect(wiredService.restore(restoreInput)).rejects.toMatchObject({
        name: 'ConflictError',
        reason: 'membership_already_exists',
      });
      expect(invalidatePermissions).not.toHaveBeenCalled();
      expect(enqueueSeatQuantitySync).not.toHaveBeenCalled();
    });

    it('rethrows any other restore failure unchanged', async () => {
      const failure = new Error('restore failed');
      vi.mocked(membershipRepository.restore).mockRejectedValueOnce(failure);
      await expect(service.restore(restoreInput)).rejects.toBe(failure);
    });

    it('is a 404 when the restore matches no row', async () => {
      vi.mocked(membershipRepository.restore).mockResolvedValueOnce(null);
      await expect(wiredService.restore(restoreInput)).rejects.toBeInstanceOf(NotFoundError);
      expect(invalidatePermissions).not.toHaveBeenCalled();
      expect(enqueueSeatQuantitySync).not.toHaveBeenCalled();
    });
  });

  describe('the wired leave step (launch K4) and API-key revocation (reaudit-#7)', () => {
    it('delete ends the membership, revokes its API keys and releases the app side, then syncs seats', async () => {
      await wiredService.delete({
        scope: asScope('org_public'),
        membership_public_id: 'mem_public',
        query: { reason: 'mistake' },
      });
      expect(membershipRepository.softDelete).toHaveBeenCalledWith('mem_public', organization.id, {
        delete_reason: 'mistake',
        delete_note: null,
      });
      expect(organizationApiKeyRepository.revokeAllByCreatorInOrganization).toHaveBeenCalledWith(
        organization.id,
        membershipRow.user_id,
      );
      expect(leaveStep.releaseEndedMembership).toHaveBeenCalledWith({
        organizationId: organization.id,
        membershipId: membershipRow.id,
      });
      expect(enqueueSeatQuantitySync).toHaveBeenCalledWith({
        organization_public_id: 'org_public',
      });
    });

    it('does nothing after a refused soft delete — no keys revoked, nothing released', async () => {
      vi.mocked(membershipRepository.softDelete).mockResolvedValueOnce(null);
      await expect(
        wiredService.delete({
          scope: asScope('org_public'),
          membership_public_id: 'mem_public',
          query: { reason: 'mistake' },
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(organizationApiKeyRepository.revokeAllByCreatorInOrganization).not.toHaveBeenCalled();
      expect(leaveStep.releaseEndedMembership).not.toHaveBeenCalled();
    });

    it('leaveOrganization goes through the same leave step with reason left', async () => {
      await wiredService.leaveOrganization({
        scope: asScope('org_public'),
        user_public_id: 'member_public',
      });
      expect(membershipRepository.softDelete).toHaveBeenCalledWith('mem_public', organization.id, {
        delete_reason: 'left',
        delete_note: null,
      });
      expect(leaveStep.releaseEndedMembership).toHaveBeenCalledWith({
        organizationId: organization.id,
        membershipId: membershipRow.id,
      });
    });
  });

  describe('the owner guard around the leave step (sec-new-T1)', () => {
    const deleteInput = {
      scope: asScope('org_public'),
      membership_public_id: 'mem_public',
      query: { reason: 'mistake' },
    };

    it('refuses to remove the owner with owner_membership_fixed, before any write', async () => {
      vi.mocked(membershipRepository.findByPublicId).mockResolvedValueOnce({
        ...membershipRow,
        user_id: organization.owner_user_id,
      });
      await expect(wiredService.delete(deleteInput)).rejects.toMatchObject({
        name: 'ForbiddenError',
        messageKey: 'errors:ownerCannotBeRemoved',
        reason: 'owner_membership_fixed',
      });
      expect(membershipRepository.softDelete).not.toHaveBeenCalled();
      expect(enqueueSeatQuantitySync).not.toHaveBeenCalled();
    });

    it('surfaces the owner refusal when a concurrent transfer made the member the owner mid-delete', async () => {
      vi.mocked(membershipRepository.softDelete).mockResolvedValueOnce(null);
      vi.mocked(organizationService.requireOrganizationRecordByPublicId)
        .mockResolvedValueOnce(organization as never)
        .mockResolvedValueOnce({ ...organization, owner_user_id: membershipRow.user_id } as never);
      await expect(wiredService.delete(deleteInput)).rejects.toMatchObject({
        name: 'ForbiddenError',
        messageKey: 'errors:ownerCannotBeRemoved',
        reason: 'owner_membership_fixed',
      });
      expect(organizationService.requireOrganizationRecordByPublicId).toHaveBeenCalledTimes(2);
      expect(leaveStep.releaseEndedMembership).not.toHaveBeenCalled();
    });

    it('leaveOrganization surfaces ownerCannotLeave when a concurrent transfer made the leaver the owner', async () => {
      vi.mocked(membershipRepository.softDelete).mockResolvedValueOnce(null);
      vi.mocked(organizationService.requireOrganizationRecordByPublicId)
        .mockResolvedValueOnce(organization as never)
        .mockResolvedValueOnce({ ...organization, owner_user_id: 10 } as never);
      await expect(
        wiredService.leaveOrganization({
          scope: asScope('org_public'),
          user_public_id: 'member_public',
        }),
      ).rejects.toMatchObject({
        name: 'ForbiddenError',
        messageKey: 'errors:ownerCannotLeave',
        reason: 'owner_cannot_leave',
      });
      expect(invalidatePermissions).not.toHaveBeenCalled();
    });

    it('leaveOrganization is a 404 when the row vanished and nobody became the owner', async () => {
      vi.mocked(membershipRepository.softDelete).mockResolvedValueOnce(null);
      await expect(
        wiredService.leaveOrganization({
          scope: asScope('org_public'),
          user_public_id: 'member_public',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('the wired branch access (launch ROUTE #4)', () => {
    it('update replaces the branches a member works in through the port', async () => {
      await wiredService.update({
        scope: asScope('org_public'),
        membership_public_id: 'mem_public',
        body: { branch_ids: ['bra_one', 'bra_two'] },
        updated_by_user_public_id: 'updater_public',
      });
      expect(branchAccess.replaceBranchesForMembership).toHaveBeenCalledWith({
        organizationId: organization.id,
        membershipId: membershipRow.id,
        branchPublicIds: ['bra_one', 'bra_two'],
        createdByUserId: 10,
      });
    });

    it('a branch write without the port wired is a ConfigurationError', async () => {
      await expect(
        service.update({
          scope: asScope('org_public'),
          membership_public_id: 'mem_public',
          body: { branch_ids: ['bra_one'] },
          updated_by_user_public_id: 'updater_public',
        }),
      ).rejects.toBeInstanceOf(ConfigurationError);
    });
  });

  describe('getCallerMembershipContext (GET /auth/me/context)', () => {
    const userScope = PRINCIPAL_SCOPE.REQUEST({
      userPublicId: 'user_public',
      organizationPublicId: 'org_public',
    }) as UserPrincipalDatabaseScope;

    it("answers the caller's membership and every live role, the main role first (D5)", async () => {
      vi.mocked(membershipAdditionalRolesRepository.listRoleIdsForMembership).mockResolvedValueOnce(
        [7],
      );
      const context = await service.getCallerMembershipContext(userScope);
      expect(organizationService.resolveUserInternalIdByPublicId).toHaveBeenCalledWith(
        'user_public',
      );
      expect(membershipRepository.findByUserAndOrganization).toHaveBeenCalledWith(
        10,
        organization.id,
      );
      expect(membershipRepository.resolveRoleSummariesByInternalIds).toHaveBeenCalledWith([2, 7]);
      expect(context).toEqual({
        membership_id: 'mem_public',
        roles: [
          { id: 'role_public_2', name: 'Admin', tone: 'sky', is_system: true },
          { id: 'role_public_7', name: 'Doctor', tone: 'sky', is_system: false },
        ],
      });
    });

    it('drops a role that no longer resolves (deleted meanwhile)', async () => {
      vi.mocked(membershipAdditionalRolesRepository.listRoleIdsForMembership).mockResolvedValueOnce(
        [8],
      );
      vi.mocked(membershipRepository.resolveRoleSummariesByInternalIds).mockResolvedValueOnce(
        new Map([[2, roleSummary(2)]]) as never,
      );
      const context = await service.getCallerMembershipContext(userScope);
      expect(context?.roles.map((summary) => summary.id)).toEqual(['role_public_2']);
    });

    it('is null without an active organization, before any read', async () => {
      const context = await service.getCallerMembershipContext(
        PRINCIPAL_SCOPE.REQUEST({ userPublicId: 'user_public' }) as UserPrincipalDatabaseScope,
      );
      expect(context).toBeNull();
      expect(withAppDatabaseContext).not.toHaveBeenCalled();
    });

    it('reads an unknown organization as no membership', async () => {
      vi.mocked(organizationService.requireOrganizationRecordByPublicId).mockRejectedValueOnce(
        new NotFoundError('Organization'),
      );
      await expect(service.getCallerMembershipContext(userScope)).resolves.toBeNull();
      expect(membershipRepository.findByUserAndOrganization).not.toHaveBeenCalled();
    });

    it('propagates any other organization failure', async () => {
      vi.mocked(organizationService.requireOrganizationRecordByPublicId).mockRejectedValueOnce(
        new Error('organization read failed'),
      );
      await expect(service.getCallerMembershipContext(userScope)).rejects.toThrow(
        'organization read failed',
      );
    });

    it('is null when the login no longer resolves', async () => {
      vi.mocked(organizationService.resolveUserInternalIdByPublicId).mockResolvedValueOnce(null);
      await expect(service.getCallerMembershipContext(userScope)).resolves.toBeNull();
      expect(membershipRepository.findByUserAndOrganization).not.toHaveBeenCalled();
    });

    it('is null without a live membership', async () => {
      vi.mocked(membershipRepository.findByUserAndOrganization).mockResolvedValueOnce(null);
      await expect(service.getCallerMembershipContext(userScope)).resolves.toBeNull();
      expect(membershipRepository.resolveRoleSummariesByInternalIds).not.toHaveBeenCalled();
    });
  });

  describe('summarizeTeamForSetup (feat-clinic-setup)', () => {
    it("answers the team facts and the caller's membership id", async () => {
      vi.mocked(membershipRepository.summarizeTeamForSetup).mockResolvedValueOnce({
        has_teammate: true,
        has_bookable_member: false,
      });
      const summary = await service.summarizeTeamForSetup({
        scope: asScope('org_public'),
        bookableRoleNames: ['Doctor', 'Therapist'],
        actingUserPublicId: 'user_public',
      });
      expect(membershipRepository.summarizeTeamForSetup).toHaveBeenCalledWith({
        organization_id: organization.id,
        owner_user_id: organization.owner_user_id,
        bookable_role_names: ['Doctor', 'Therapist'],
      });
      expect(membershipRepository.findByUserAndOrganization).toHaveBeenCalledWith(
        10,
        organization.id,
      );
      expect(summary).toEqual({
        hasTeammate: true,
        hasBookableMember: false,
        actingMembershipId: membershipRow.id,
      });
    });

    it('carries a bookable member through and a null membership for an unresolved caller', async () => {
      vi.mocked(membershipRepository.summarizeTeamForSetup).mockResolvedValueOnce({
        has_teammate: false,
        has_bookable_member: true,
      });
      vi.mocked(organizationService.resolveUserInternalIdByPublicId).mockResolvedValueOnce(null);
      const summary = await service.summarizeTeamForSetup({
        scope: asScope('org_public'),
        bookableRoleNames: ['Doctor'],
        actingUserPublicId: undefined,
      });
      expect(membershipRepository.findByUserAndOrganization).not.toHaveBeenCalled();
      expect(summary).toEqual({
        hasTeammate: false,
        hasBookableMember: true,
        actingMembershipId: null,
      });
    });

    it('answers a null membership id when the caller is no member here', async () => {
      vi.mocked(membershipRepository.findByUserAndOrganization).mockResolvedValueOnce(null);
      const summary = await service.summarizeTeamForSetup({
        scope: asScope('org_public'),
        bookableRoleNames: [],
        actingUserPublicId: 'user_public',
      });
      expect(summary.actingMembershipId).toBeNull();
    });
  });

  describe('countActiveMembers (REQ-4 — billing reads seats_used here)', () => {
    it('counts the seat-occupying memberships of the organization', async () => {
      vi.mocked(membershipRepository.countActiveByOrganization).mockResolvedValueOnce(4);
      await expect(
        service.countActiveMembers({ organizationPublicId: 'org_public' }),
      ).resolves.toBe(4);
      expect(organizationService.requireOrganizationByPublicId).toHaveBeenCalledWith('org_public');
      expect(membershipRepository.countActiveByOrganization).toHaveBeenCalledWith(organization.id);
    });

    it('throws when the organization does not resolve', async () => {
      vi.mocked(organizationService.requireOrganizationByPublicId).mockRejectedValueOnce(
        new NotFoundError('Organization'),
      );
      await expect(
        service.countActiveMembers({ organizationPublicId: 'org_missing' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(membershipRepository.countActiveByOrganization).not.toHaveBeenCalled();
    });
  });

  describe('listOrganizationsForUserDataExport (GDPR bundle)', () => {
    it("lists the user's memberships under their own context, capped", async () => {
      const rows = [{ name: 'Clinic', slug: 'clinic', status: 'active', created_at: new Date() }];
      vi.mocked(membershipRepository.listOrganizationsForUserDataExport).mockResolvedValueOnce(
        rows as never,
      );
      const result = await service.listOrganizationsForUserDataExport({
        userPublicId: 'user_public',
        userInternalId: 10,
        limit: 50,
      });
      expect(result).toBe(rows);
      expect(membershipRepository.listOrganizationsForUserDataExport).toHaveBeenCalledWith(10, 50);
      expect(withAppDatabaseContext).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({ userPublicId: 'user_public' }),
        }),
      );
    });
  });

  describe("the organization's default locale for a new member (create)", () => {
    const createInput = {
      scope: asScope('org_public'),
      body: { email: 'invitee@example.com', role_ids: ['role_public'] },
      invited_by_user_public_id: 'inviter_public',
    };

    it('adopts the default locale for an invitee still on the factory settings', async () => {
      await wiredService.create(createInput);
      expect(userSettingsService.getForInvitedUser).toHaveBeenCalledWith('user_public');
      expect(organizationSettingsService.resolveDefaultLocaleForOrganization).toHaveBeenCalledWith(
        'org_public',
      );
      expect(userSettingsService.updateForInvitedUser).toHaveBeenCalledWith({
        user_public_id: 'user_public',
        body: { language: 'es', preferred_locales: ['es'] },
      });
    });

    it('never overwrites a locale the invitee chose', async () => {
      vi.mocked(userSettingsService.getForInvitedUser).mockResolvedValueOnce({
        language: 'fr',
        preferred_locales: ['fr'],
      } as never);
      await wiredService.create(createInput);
      expect(
        organizationSettingsService.resolveDefaultLocaleForOrganization,
      ).not.toHaveBeenCalled();
      expect(userSettingsService.updateForInvitedUser).not.toHaveBeenCalled();
    });

    it('is skipped entirely in a harness without the settings services', async () => {
      await service.create(createInput);
      expect(userSettingsService.getForInvitedUser).not.toHaveBeenCalled();
    });
  });
});
