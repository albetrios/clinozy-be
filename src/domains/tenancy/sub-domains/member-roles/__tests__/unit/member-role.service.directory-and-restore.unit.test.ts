import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/domains/tenancy/sub-domains/permission/permission-cache.service.js', () => ({
  invalidateOrganizationPermissions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Blanket maintenance passthrough: services this suite touches (directly or via
    // cross-domain imports) may enter maintenance contexts (tombstoning, admin reads) —
    // the real wrapper opens a database.transaction() and CI's unit lane has no Postgres.
    withMaintenanceDatabaseContext: vi.fn(
      async ({ callback }: { callback: () => Promise<unknown> }) => callback(),
    ),
    withAppDatabaseContext: vi.fn(async ({ callback }: { callback: () => Promise<unknown> }) =>
      callback(),
    ),
  };
});

import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors/index.js';
import { env } from '@/shared/config/env.config.js';
import { MemberRoleService } from '@/domains/tenancy/sub-domains/member-roles/member-role.service.js';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { MemberRoleRepository } from '@/domains/tenancy/sub-domains/member-roles/member-role.repository.js';
import type { MemberRolePermissionRepository } from '@/domains/tenancy/sub-domains/member-roles/member-role-permission/member-role-permission.repository.js';
import type { AuthorizationService } from '@/domains/tenancy/sub-domains/permission/authorization.service.js';
import type { PermissionRepository } from '@/domains/tenancy/sub-domains/permission/permission.repository.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  PRINCIPAL_SCOPE,
  type OrganizationPrincipalDatabaseScope,
} from '@/infrastructure/database/contexts/database-context.js';

const organization = { id: 1, public_id: generatePublicId('organization'), type: 'TEAM' };
const roleRow = {
  id: 2,
  public_id: generatePublicId('memberRole'),
  organization_id: 1,
  name: 'Admin',
  description: 'Admin role',
  is_system: false,
  tone: 'sky',
  is_locked: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-02T00:00:00.000Z'),
  updated_by_user_id: 4,
  deleted_at: null,
};
/** The role a new one copies its access from (RC-142). */
const sourceRole = { ...roleRow, id: 9, public_id: generatePublicId('memberRole'), name: 'Doctor' };
/** A role within its restore window (launch §2.D route 17, T12). */
const deletedRole = { ...roleRow, deleted_at: new Date('2026-02-01T00:00:00.000Z') };

const asScope = (organizationPublicId: string) =>
  PRINCIPAL_SCOPE.REQUEST({
    organizationPublicId,
  }) as OrganizationPrincipalDatabaseScope;

/** The duplicate-key error node-postgres raises on the `(organization_id, name)` unique index. */
const uniqueViolation = () => Object.assign(new Error('duplicate key'), { code: '23505' });

describe('MemberRoleService — the role directory, copied access, name conflicts and restore', () => {
  const organizationService = {
    requireOrganizationRecordByPublicId: vi.fn().mockResolvedValue(organization),
    resolveUserInternalIdByPublicId: vi.fn().mockResolvedValue(5),
    resolveUserPublicIdByInternalId: vi.fn().mockResolvedValue('user_public'),
  } as unknown as OrganizationService;

  const memberRoleRepository = {
    findByOrganizationId: vi
      .fn()
      .mockResolvedValue({ items: [roleRow], limit: 20, has_more: false, next_cursor: null }),
    findByPublicId: vi.fn().mockResolvedValue(roleRow),
    findDeletedByPublicId: vi.fn().mockResolvedValue(deletedRole),
    countActiveByOrganization: vi.fn().mockResolvedValue(0),
    acquireCreationQuotaLock: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(roleRow),
    update: vi.fn().mockResolvedValue(roleRow),
    restore: vi.fn().mockResolvedValue(roleRow),
    countMembersForRole: vi.fn().mockResolvedValue(0),
  } as unknown as MemberRoleRepository;

  const memberRolePermissionRepository = {
    findByRoleId: vi.fn().mockResolvedValue([]),
    replace: vi.fn().mockResolvedValue([]),
  } as unknown as MemberRolePermissionRepository;

  const authorizationService = {
    resolveUserOrganizationPermissionsFromDatabase: vi.fn().mockResolvedValue([]),
  } as unknown as AuthorizationService;

  const permissionRepository = {
    findAll: vi.fn().mockResolvedValue([]),
  } as unknown as PermissionRepository;

  const service = new MemberRoleService(
    organizationService,
    memberRoleRepository,
    memberRolePermissionRepository,
    authorizationService,
    permissionRepository,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(organizationService.requireOrganizationRecordByPublicId).mockResolvedValue(
      organization as never,
    );
    vi.mocked(organizationService.resolveUserInternalIdByPublicId).mockResolvedValue(5);
    vi.mocked(memberRoleRepository.findByPublicId).mockResolvedValue(roleRow as never);
    vi.mocked(memberRoleRepository.findDeletedByPublicId).mockResolvedValue(deletedRole as never);
    vi.mocked(memberRoleRepository.countActiveByOrganization).mockResolvedValue(0);
    vi.mocked(memberRoleRepository.create).mockResolvedValue(roleRow as never);
    vi.mocked(memberRoleRepository.update).mockResolvedValue(roleRow as never);
    vi.mocked(memberRoleRepository.restore).mockResolvedValue(roleRow as never);
    vi.mocked(memberRoleRepository.countMembersForRole).mockResolvedValue(0);
    vi.mocked(memberRolePermissionRepository.findByRoleId).mockResolvedValue([]);
    vi.mocked(permissionRepository.findAll).mockResolvedValue([]);
    vi.mocked(
      authorizationService.resolveUserOrganizationPermissionsFromDatabase,
    ).mockResolvedValue([]);
  });

  describe('listDirectory (GET /app/roles, launch D81 (4))', () => {
    it('reads one page of live roles in the order they were made, without member counts', async () => {
      const page = { items: [roleRow], limit: 20, has_more: false, next_cursor: null };
      vi.mocked(memberRoleRepository.findByOrganizationId).mockResolvedValueOnce(page as never);
      const result = await service.listDirectory({
        scope: asScope(organization.public_id),
        pagination: { limit: 20 },
      });
      expect(organizationService.requireOrganizationRecordByPublicId).toHaveBeenCalledWith(
        organization.public_id,
      );
      expect(memberRoleRepository.findByOrganizationId).toHaveBeenCalledWith(organization.id, {
        limit: 20,
        sort: 'created_at',
        order: 'asc',
      });
      // The raw page: the directory names roles, it does not manage them.
      expect(result).toBe(page);
    });

    it('continues from the cursor it is given', async () => {
      await service.listDirectory({
        scope: asScope(organization.public_id),
        pagination: { limit: 5, after: 'cursor_after' },
      });
      expect(memberRoleRepository.findByOrganizationId).toHaveBeenCalledWith(organization.id, {
        after: 'cursor_after',
        limit: 5,
        sort: 'created_at',
        order: 'asc',
      });
    });

    it('throws NotFoundError when the organization is missing, before any read', async () => {
      vi.mocked(organizationService.requireOrganizationRecordByPublicId).mockRejectedValueOnce(
        new NotFoundError('Organization'),
      );
      await expect(
        service.listDirectory({ scope: asScope('org_missing'), pagination: { limit: 20 } }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(memberRoleRepository.findByOrganizationId).not.toHaveBeenCalled();
    });
  });

  describe('create — copying access from another role (RC-142)', () => {
    const createInput = {
      scope: asScope(organization.public_id),
      created_by_user_public_id: 'creator_public',
    };

    beforeEach(() => {
      vi.mocked(permissionRepository.findAll).mockResolvedValue([
        { code: 'organization:read' },
        { code: 'membership:read' },
      ] as never);
      vi.mocked(
        authorizationService.resolveUserOrganizationPermissionsFromDatabase,
      ).mockResolvedValue(['organization:read', 'membership:read']);
    });

    it("joins the source role's codes to the listed ones, each once, and grants them in the same transaction", async () => {
      vi.mocked(memberRoleRepository.findByPublicId).mockResolvedValueOnce(sourceRole as never);
      vi.mocked(memberRolePermissionRepository.findByRoleId).mockResolvedValueOnce([
        { permission_code: 'organization:read' },
        { permission_code: 'membership:read' },
      ] as never);
      await service.create({
        ...createInput,
        body: {
          name: 'Nurse',
          permission_codes: ['organization:read'],
          copy_from_role_id: sourceRole.public_id,
        },
      });
      expect(memberRoleRepository.findByPublicId).toHaveBeenCalledWith(
        sourceRole.public_id,
        organization.id,
      );
      expect(memberRolePermissionRepository.findByRoleId).toHaveBeenCalledWith(sourceRole.id);
      expect(memberRoleRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Nurse', organization_id: organization.id }),
      );
      expect(memberRolePermissionRepository.replace).toHaveBeenCalledWith(
        roleRow.id,
        ['organization:read', 'membership:read'],
        5,
      );
    });

    it('copies a role that lists nothing without granting anything', async () => {
      vi.mocked(memberRoleRepository.findByPublicId).mockResolvedValueOnce(sourceRole as never);
      await service.create({
        ...createInput,
        body: { name: 'Nurse', copy_from_role_id: sourceRole.public_id },
      });
      expect(memberRoleRepository.create).toHaveBeenCalled();
      expect(memberRolePermissionRepository.replace).not.toHaveBeenCalled();
    });

    it('refuses an id that is no live role here as a 400 on copy_from_role_id, creating nothing', async () => {
      vi.mocked(memberRoleRepository.findByPublicId).mockResolvedValueOnce(null);
      const missingId = generatePublicId('memberRole');
      await expect(
        service.create({ ...createInput, body: { name: 'Nurse', copy_from_role_id: missingId } }),
      ).rejects.toMatchObject({
        name: 'ValidationError',
        messageKey: 'errors:validation.roleToCopyNotFound',
        messageParams: { role_id: missingId },
        errors: [
          { field: 'copy_from_role_id', messageKey: 'errors:validation.roleToCopyNotFound' },
        ],
      });
      expect(memberRolePermissionRepository.findByRoleId).not.toHaveBeenCalled();
      expect(memberRoleRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('create — the per-organization role cap (sec-r5-followup-ratelimit-dos-2, audit-#8)', () => {
    it('refuses a role past the cap under the quota lock, creating nothing', async () => {
      vi.mocked(memberRoleRepository.countActiveByOrganization).mockResolvedValueOnce(
        env.MEMBER_ROLE_MAX_PER_ORG,
      );
      await expect(
        service.create({
          scope: asScope(organization.public_id),
          body: { name: 'One too many' },
          created_by_user_public_id: 'creator_public',
        }),
      ).rejects.toMatchObject({
        name: 'ConflictError',
        messageKey: 'errors:memberRoleMaxReached',
        messageParams: { max: env.MEMBER_ROLE_MAX_PER_ORG },
      });
      expect(memberRoleRepository.acquireCreationQuotaLock).toHaveBeenCalledWith(organization.id);
      expect(memberRoleRepository.create).not.toHaveBeenCalled();
    });

    it('admits a role one below the cap', async () => {
      vi.mocked(memberRoleRepository.countActiveByOrganization).mockResolvedValueOnce(
        env.MEMBER_ROLE_MAX_PER_ORG - 1,
      );
      await service.create({
        scope: asScope(organization.public_id),
        body: { name: 'Last one' },
        created_by_user_public_id: 'creator_public',
      });
      expect(memberRoleRepository.create).toHaveBeenCalled();
    });
  });

  describe('update — a save based on an older version (T14 / D43)', () => {
    it('refuses with record_changed, naming who changed the role and when', async () => {
      await expect(
        service.update({
          scope: asScope(organization.public_id),
          role_public_id: roleRow.public_id,
          body: { name: 'Stale', expected_updated_at: '2026-01-01T00:00:00.000Z' },
          updated_by_user_public_id: 'updater_public',
        }),
      ).rejects.toMatchObject({
        name: 'ConflictError',
        reason: 'record_changed',
        messageParams: { updated_at: '2026-01-02T00:00:00.000Z', updated_by: 'user_public' },
      });
      expect(organizationService.resolveUserPublicIdByInternalId).toHaveBeenCalledWith(4);
      expect(memberRoleRepository.update).not.toHaveBeenCalled();
    });

    it('accepts a save based on the current version', async () => {
      await service.update({
        scope: asScope(organization.public_id),
        role_public_id: roleRow.public_id,
        body: { name: 'Fresh', expected_updated_at: '2026-01-02T00:00:00.000Z' },
        updated_by_user_public_id: 'updater_public',
      });
      expect(memberRoleRepository.update).toHaveBeenCalledWith(
        roleRow.public_id,
        organization.id,
        { name: 'Fresh' },
        5,
      );
    });
  });

  describe('a duplicate role name (the unique index on organization_id, name)', () => {
    it('create surfaces it as a 409 naming the role', async () => {
      vi.mocked(memberRoleRepository.create).mockRejectedValueOnce(uniqueViolation());
      await expect(
        service.create({
          scope: asScope(organization.public_id),
          body: { name: 'Admin' },
          created_by_user_public_id: 'creator_public',
        }),
      ).rejects.toMatchObject({
        name: 'ConflictError',
        messageKey: 'errors:roleNameExists',
        messageParams: { name: 'Admin' },
      });
    });

    it('create rethrows any other insert failure unchanged', async () => {
      const failure = new Error('insert failed');
      vi.mocked(memberRoleRepository.create).mockRejectedValueOnce(failure);
      await expect(
        service.create({
          scope: asScope(organization.public_id),
          body: { name: 'Admin' },
          created_by_user_public_id: 'creator_public',
        }),
      ).rejects.toBe(failure);
    });

    it('update surfaces it as a 409 naming the new name', async () => {
      vi.mocked(memberRoleRepository.update).mockRejectedValueOnce(uniqueViolation());
      await expect(
        service.update({
          scope: asScope(organization.public_id),
          role_public_id: roleRow.public_id,
          body: { name: 'Taken' },
          updated_by_user_public_id: 'updater_public',
        }),
      ).rejects.toMatchObject({
        name: 'ConflictError',
        messageKey: 'errors:roleNameExists',
        messageParams: { name: 'Taken' },
      });
    });

    it('update carries no name when the body changed none', async () => {
      vi.mocked(memberRoleRepository.update).mockRejectedValueOnce(uniqueViolation());
      const failure = await service
        .update({
          scope: asScope(organization.public_id),
          role_public_id: roleRow.public_id,
          body: { description: 'A purpose' },
          updated_by_user_public_id: 'updater_public',
        })
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ConflictError);
      expect((failure as ConflictError).messageParams).toBeUndefined();
    });

    it('update rethrows any other write failure unchanged', async () => {
      const failure = new Error('update failed');
      vi.mocked(memberRoleRepository.update).mockRejectedValueOnce(failure);
      await expect(
        service.update({
          scope: asScope(organization.public_id),
          role_public_id: roleRow.public_id,
          body: { name: 'Taken' },
          updated_by_user_public_id: 'updater_public',
        }),
      ).rejects.toBe(failure);
    });
  });

  describe('restore (launch §2.D route 17, T12)', () => {
    const restoreInput = {
      scope: asScope(organization.public_id),
      role_public_id: roleRow.public_id,
      restored_by_user_public_id: 'restorer_public',
    };

    it('undoes the delete and answers the role with its member count', async () => {
      vi.mocked(memberRoleRepository.countMembersForRole).mockResolvedValueOnce(2);
      const result = await service.restore(restoreInput);
      expect(memberRoleRepository.findDeletedByPublicId).toHaveBeenCalledWith(
        roleRow.public_id,
        organization.id,
      );
      expect(organizationService.resolveUserInternalIdByPublicId).toHaveBeenCalledWith(
        'restorer_public',
      );
      expect(memberRoleRepository.restore).toHaveBeenCalledWith(
        roleRow.public_id,
        organization.id,
        5,
      );
      expect(memberRoleRepository.countMembersForRole).toHaveBeenCalledWith(
        roleRow.id,
        organization.id,
      );
      expect(result).toEqual({
        id: roleRow.public_id,
        name: 'Admin',
        description: 'Admin role',
        is_system: false,
        tone: 'sky',
        is_locked: false,
        member_count: 2,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      });
    });

    it('records no restorer when the acting user cannot be resolved', async () => {
      vi.mocked(organizationService.resolveUserInternalIdByPublicId).mockResolvedValueOnce(null);
      await service.restore({ ...restoreInput, restored_by_user_public_id: undefined });
      expect(memberRoleRepository.restore).toHaveBeenCalledWith(
        roleRow.public_id,
        organization.id,
        null,
      );
    });

    it('is a 409 record_not_deleted for a live role', async () => {
      vi.mocked(memberRoleRepository.findDeletedByPublicId).mockResolvedValueOnce(null);
      await expect(service.restore(restoreInput)).rejects.toMatchObject({
        name: 'ConflictError',
        messageKey: 'errors:recordNotDeleted',
        reason: 'record_not_deleted',
      });
      expect(memberRoleRepository.findByPublicId).toHaveBeenCalledWith(
        roleRow.public_id,
        organization.id,
      );
      expect(memberRoleRepository.restore).not.toHaveBeenCalled();
    });

    it('is a 404 for a role that is neither deleted nor live here', async () => {
      vi.mocked(memberRoleRepository.findDeletedByPublicId).mockResolvedValueOnce(null);
      vi.mocked(memberRoleRepository.findByPublicId).mockResolvedValueOnce(null);
      await expect(service.restore(restoreInput)).rejects.toBeInstanceOf(NotFoundError);
      expect(memberRoleRepository.restore).not.toHaveBeenCalled();
    });

    it('is a 409 record_restore_conflict when a live role took the name meanwhile', async () => {
      vi.mocked(memberRoleRepository.restore).mockRejectedValueOnce(uniqueViolation());
      await expect(service.restore(restoreInput)).rejects.toMatchObject({
        name: 'ConflictError',
        messageKey: 'errors:recordRestoreConflict',
        reason: 'record_restore_conflict',
      });
      expect(memberRoleRepository.countMembersForRole).not.toHaveBeenCalled();
    });

    it('rethrows any other restore failure unchanged', async () => {
      const failure = new Error('restore failed');
      vi.mocked(memberRoleRepository.restore).mockRejectedValueOnce(failure);
      await expect(service.restore(restoreInput)).rejects.toBe(failure);
    });

    it('is a 404 when the restore matches no row', async () => {
      vi.mocked(memberRoleRepository.restore).mockResolvedValueOnce(null);
      await expect(service.restore(restoreInput)).rejects.toBeInstanceOf(NotFoundError);
      expect(memberRoleRepository.countMembersForRole).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the organization is missing, before any read', async () => {
      vi.mocked(organizationService.requireOrganizationRecordByPublicId).mockRejectedValueOnce(
        new NotFoundError('Organization'),
      );
      await expect(service.restore(restoreInput)).rejects.toBeInstanceOf(NotFoundError);
      expect(memberRoleRepository.findDeletedByPublicId).not.toHaveBeenCalled();
    });

    it('a ValidationError from elsewhere is never mapped to a conflict', async () => {
      const refusal = new ValidationError('errors:validation.failed');
      vi.mocked(memberRoleRepository.restore).mockRejectedValueOnce(refusal);
      await expect(service.restore(restoreInput)).rejects.toBe(refusal);
    });
  });
});
