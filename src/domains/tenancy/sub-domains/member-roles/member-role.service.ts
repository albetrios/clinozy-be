import { env } from '@/shared/config/env.config.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/shared/errors/index.js';
import { isPostgresUniqueViolation } from '@/shared/utils/infrastructure/postgres-error.util.js';
import {
  withAppDatabaseContext,
  type OrganizationPrincipalDatabaseScope,
} from '@/infrastructure/database/contexts/database-context.js';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { assertTeamOrganization } from '@/domains/tenancy/sub-domains/organization/organization-capability.js';
import type { MemberRoleRepository } from './member-role.repository.js';
import type { MemberRolePermissionRepository } from './member-role-permission/member-role-permission.repository.js';
import type { MemberRoleOutput, MemberRoleRow } from './member-role.types.js';
import {
  validateCreateMemberRole,
  validateDeleteMemberRoleQuery,
  validateUpdateMemberRole,
  validateListMemberRolesQuery,
} from './member-role.validator.js';
import { serializeMemberRole } from './member-role.serializer.js';
import { invalidateOrganizationPermissions } from '@/domains/tenancy/sub-domains/permission/permission-cache.service.js';
import type { AuthorizationService } from '@/domains/tenancy/sub-domains/permission/authorization.service.js';
import type { PermissionRepository } from '@/domains/tenancy/sub-domains/permission/permission.repository.js';
import { assertCallerCanGrantPermissionCodes } from '@/domains/tenancy/sub-domains/permission/assert-grantable-permissions.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import { assertRecordNotChangedSince } from '@/shared/utils/validation/record-fields.util.js';
import type { ListMemberRolesQueryInput } from './member-role.dto.js';

/**
 * Application service for the per-organization role catalog: list, get,
 * create, update, and soft-delete custom roles.
 *
 * @remarks
 * - **Algorithm:** every public method runs inside
 *   `withAppDatabaseContext` and resolves the caller's
 *   organization through {@link OrganizationService.requireOrganizationRecordByPublicId}
 *   before touching the role repository, so RLS and membership checks happen
 *   before any data access.
 * - **Failure modes:** `NotFoundError('Role' | 'Organization')` when lookups
 *   miss or rows are soft-deleted; `ValidationError` (i18n) for bad input or
 *   illegal pagination. The repository's unique index on `(organization_id,
 *   name)` raises duplicate-key errors for collisions on create/update.
 * - **Side effects:** writes through `MemberRoleRepository` (insert / update /
 *   soft-delete with `deleted_at`). Deleting a role calls
 *   {@link invalidateOrganizationPermissions} so members who held it stop
 *   resolving its permissions from cache. {@link create} may optionally assign an
 *   initial permission set in the same transaction (reusing the same
 *   `assertCallerCanGrantPermissionCodes` guard as the PUT); the companion
 *   {@link MemberRolePermissionService} owns all subsequent edits to the set.
 * - **Notes:** `requireRoleRecord*` and `resolveRolePublicId*` helpers are
 *   shared with other tenancy services (membership, invitations) to keep role
 *   identity resolution in one place.
 */
export class MemberRoleService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly memberRoleRepository: MemberRoleRepository,
    private readonly memberRolePermissionRepository: MemberRolePermissionRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly permissionRepository: PermissionRepository,
  ) {}

  async list(scope: OrganizationPrincipalDatabaseScope, pagination: ListMemberRolesQueryInput) {
    const organization_public_id = scope.organizationPublicId;
    return withAppDatabaseContext(scope, async () => {
      const organization =
        await this.organizationService.requireOrganizationRecordByPublicId(organization_public_id);
      validateListMemberRolesQuery(pagination);
      const result = await this.memberRoleRepository.findByOrganizationId(
        organization.id,
        omitUndefined({
          after: pagination.after,
          limit: pagination.limit,
          q: pagination.q,
          sort: pagination.sort,
          order: pagination.order,
        }),
      );
      // One membership aggregate (GROUP BY role_id) → member_count per role, so the roles-list
      // projection stays a single extra query instead of an N+1 across the page.
      const memberCounts = await this.memberRoleRepository.countMembersByRoleForOrganization(
        organization.id,
      );
      return {
        items: result.items.map((role) =>
          serializeMemberRole(role, memberCounts.get(role.id) ?? 0),
        ),
        limit: result.limit,
        total: result.total,
        has_more: result.has_more,
        next_cursor: result.next_cursor,
      };
    });
  }

  /**
   * One page of the organization's live roles in the order they were made — Owner, Admin, the
   * clinic presets, then the custom roles — for the role directory every member reads
   * (`GET /app/roles`, launch D81 (4)), as the member directory is `GET /app/memberships`.
   *
   * @remarks
   * - **Algorithm:** the roles keyset list sorted by `created_at` then `id` ascending (the
   *   provisioned roles share one transaction's time, so the id keeps their order); no member
   *   counts — the directory names roles, it does not manage them.
   * - **Failure modes:** `NotFoundError('Organization')`.
   * - **Side effects:** none (read-only).
   */
  async listDirectory(
    scope: OrganizationPrincipalDatabaseScope,
    pagination: { limit: number; after?: string | undefined },
  ): Promise<{
    items: MemberRoleRow[];
    limit: number;
    has_more: boolean;
    next_cursor: string | null;
  }> {
    return withAppDatabaseContext(scope, async () => {
      const organization = await this.organizationService.requireOrganizationRecordByPublicId(
        scope.organizationPublicId,
      );
      return this.memberRoleRepository.findByOrganizationId(
        organization.id,
        omitUndefined({
          after: pagination.after,
          limit: pagination.limit,
          sort: 'created_at' as const,
          order: 'asc' as const,
        }),
      );
    });
  }

  async requireRoleRecordForOrganization(
    organization_id: number,
    role_public_id: string,
  ): Promise<MemberRoleRow> {
    const role = await this.memberRoleRepository.findByPublicId(role_public_id, organization_id);
    if (!role) throw new NotFoundError('Role');
    return role;
  }

  async requireRoleRecordByPublicId(
    organization_public_id: string,
    role_public_id: string,
  ): Promise<MemberRoleRow> {
    const organization =
      await this.organizationService.requireOrganizationRecordByPublicId(organization_public_id);
    return this.requireRoleRecordForOrganization(organization.id, role_public_id);
  }

  async resolveRolePublicIdForOrganization(
    organization_id: number,
    role_internal_id: number,
  ): Promise<string> {
    const role = await this.memberRoleRepository.findByInternalId(
      role_internal_id,
      organization_id,
    );
    if (!role) throw new NotFoundError('Role');
    return role.public_id;
  }

  async resolveRolePublicIdByInternalId(
    organization_public_id: string,
    role_internal_id: number,
  ): Promise<string> {
    const organization =
      await this.organizationService.requireOrganizationRecordByPublicId(organization_public_id);
    return this.resolveRolePublicIdForOrganization(organization.id, role_internal_id);
  }

  async getByPublicId(
    scope: OrganizationPrincipalDatabaseScope,
    role_public_id: string,
  ): Promise<MemberRoleOutput> {
    const organization_public_id = scope.organizationPublicId;
    return withAppDatabaseContext(scope, async () => {
      const organization =
        await this.organizationService.requireOrganizationRecordByPublicId(organization_public_id);
      const role = await this.memberRoleRepository.findByPublicId(role_public_id, organization.id);
      if (!role) throw new NotFoundError('Role');
      const memberCount = await this.memberRoleRepository.countMembersForRole(
        role.id,
        organization.id,
      );
      return serializeMemberRole(role, memberCount);
    });
  }

  /**
   * Translate a repository write failure into a clean conflict when it is the
   * `(organization_id, name)` unique violation, so duplicate role names surface
   * as 409 instead of an unhandled 500. Any other error is rethrown unchanged.
   */
  private mapRoleNameConflict(error: unknown, name: string | undefined): unknown {
    if (isPostgresUniqueViolation(error)) {
      return new ConflictError('errors:roleNameExists', name ? { name } : undefined);
    }
    return error;
  }

  async create(
    scope: OrganizationPrincipalDatabaseScope,
    body: unknown,
    created_by_user_public_id: string | undefined,
  ): Promise<MemberRoleOutput> {
    const organization_public_id = scope.organizationPublicId;
    const parsed = validateCreateMemberRole(body);
    return withAppDatabaseContext(scope, async () => {
      const organization =
        await this.organizationService.requireOrganizationRecordByPublicId(organization_public_id);
      // Capability matrix: a PERSONAL organization is single-member by definition, so custom roles
      // (which exist to grant scoped permissions to OTHER members) are meaningless there. Reject —
      // role management is a TEAM-organization feature.
      assertTeamOrganization(organization, 'ROLES');
      // sec-r5-followup-ratelimit-dos-2 + audit-#8: serialize the per-organization count + insert with a
      // transaction-scoped advisory lock so concurrent creates cannot both pass the same count
      // and overshoot MEMBER_ROLE_MAX_PER_ORG. The lock auto-releases at commit.
      await this.memberRoleRepository.acquireCreationQuotaLock(organization.id);
      const activeCount = await this.memberRoleRepository.countActiveByOrganization(
        organization.id,
      );
      if (activeCount >= env.MEMBER_ROLE_MAX_PER_ORG) {
        throw new ConflictError('errors:memberRoleMaxReached', {
          max: env.MEMBER_ROLE_MAX_PER_ORG,
        });
      }
      const userId =
        await this.organizationService.resolveUserInternalIdByPublicId(created_by_user_public_id);

      // When an initial permission set is requested, verify the caller may grant every code
      // BEFORE creating the role. An escalation attempt (a code the caller does not hold) or an
      // unknown code throws here, and the whole `withAppDatabaseContext` transaction
      // rolls back — no half-made role. A brand-new role has no current permissions and is never
      // the owner role, so the owner-protection / removed-codes checks the PUT path runs do not apply.
      // RC-142: "copy access from" another role — its codes join any listed ones.
      const copiedCodes = parsed.copy_from_role_id
        ? await this.listCodesOfRoleToCopy(organization.id, parsed.copy_from_role_id)
        : [];
      const permissionCodes = [...new Set([...(parsed.permission_codes ?? []), ...copiedCodes])];
      if (permissionCodes.length > 0) {
        await assertCallerCanGrantPermissionCodes({
          authorizationService: this.authorizationService,
          permissionRepository: this.permissionRepository,
          callerUserPublicId: created_by_user_public_id,
          organizationPublicId: organization_public_id,
          requestedPermissionCodes: permissionCodes,
        });
      }

      let created: MemberRoleRow;
      try {
        // sec-T3: `is_system` is intentionally omitted — the DTO no longer accepts it
        // from clients and the repository default is false. Only seeds set it (via a
        // server-side path that does not go through this service).
        created = await this.memberRoleRepository.create(
          omitUndefined({
            organization_id: organization.id,
            name: parsed.name,
            description: parsed.description,
            tone: parsed.tone,
            created_by_user_id: userId ?? null,
          }),
        );
      } catch (error) {
        throw this.mapRoleNameConflict(error, parsed.name);
      }

      // Assign the initial permission set in the SAME transaction as the insert (atomic).
      // No cache invalidation is needed — a brand-new role has no members whose resolved
      // permissions could be stale.
      if (permissionCodes.length > 0) {
        await this.memberRolePermissionRepository.replace(
          created.id,
          permissionCodes,
          userId ?? null,
        );
      }

      // A brand-new role has no memberships yet (a member cannot be assigned to a role that did
      // not exist), so member_count is definitionally 0 — no aggregate query needed.
      return serializeMemberRole(created, 0);
    });
  }

  /**
   * The permission codes of the role a new role copies its access from (RC-142).
   *
   * @remarks
   * - **Failure modes:** an id that is no live role of the organization is a `ValidationError` on
   *   `copy_from_role_id` (400) — it is a body field, not the path.
   */
  private async listCodesOfRoleToCopy(
    organizationId: number,
    rolePublicId: string,
  ): Promise<string[]> {
    const source = await this.memberRoleRepository.findByPublicId(rolePublicId, organizationId);
    if (!source) {
      throw new ValidationError(
        'errors:validation.roleToCopyNotFound',
        { role_id: rolePublicId },
        { copy_from_role_id: [`${rolePublicId} is not a role of this organization`] },
      );
    }
    const rows = await this.memberRolePermissionRepository.findByRoleId(source.id);
    return rows.map((row) => row.permission_code);
  }

  async update(
    scope: OrganizationPrincipalDatabaseScope,
    role_public_id: string,
    body: unknown,
    updated_by_user_public_id: string | undefined,
  ): Promise<MemberRoleOutput> {
    const organization_public_id = scope.organizationPublicId;
    const parsed = validateUpdateMemberRole(body);
    return withAppDatabaseContext(scope, async () => {
      const organization =
        await this.organizationService.requireOrganizationRecordByPublicId(organization_public_id);
      const role = await this.memberRoleRepository.findByPublicId(role_public_id, organization.id);
      if (!role) throw new NotFoundError('Role');
      // T14 / D43: a save based on an older version is refused with who and when.
      await assertRecordNotChangedSince({
        row: role,
        expected: parsed.expected_updated_at,
        resolveUserPublicId: (userInternalId) =>
          this.organizationService.resolveUserPublicIdByInternalId(userInternalId),
      });
      // sec-T3: a system role's name is immutable from the API — same guard as delete. Its tone and
      // description (the role's purpose, launch RC-141) stay editable.
      if (role.is_system && parsed.name !== undefined && parsed.name !== role.name) {
        throw new ForbiddenError('errors:cannotModifySystemRole').withReason('system_role_fixed');
      }
      const userId =
        await this.organizationService.resolveUserInternalIdByPublicId(updated_by_user_public_id);
      let updated: MemberRoleRow | null;
      try {
        const { expected_updated_at: _expectedUpdatedAt, ...changes } = parsed;
        updated = await this.memberRoleRepository.update(
          role_public_id,
          organization.id,
          omitUndefined(changes),
          userId ?? null,
        );
      } catch (error) {
        throw this.mapRoleNameConflict(error, parsed.name);
      }
      if (!updated) throw new NotFoundError('Role');
      const memberCount = await this.memberRoleRepository.countMembersForRole(
        updated.id,
        organization.id,
      );
      return serializeMemberRole(updated, memberCount);
    });
  }

  /**
   * Soft-deletes a custom role with why (launch T12).
   *
   * @remarks
   * sec-T3 guards:
   *   1. **`is_system` guard** — the seeded roles cannot be deleted from the API.
   *      Surfaces as `ForbiddenError('errors:cannotDeleteSystemRole')`, `reason: system_role_fixed`
   *      (launch D81 (4)).
   *   2. **Member guard** — refuses to delete a role any live member holds (main or extra, any
   *      status), because the permission-resolution join filters `isNull(roles.deleted_at)` and
   *      would silently strip every member's permission set. Surfaces as
   *      `ConflictError('errors:roleHasActiveMembers')` — clients must reassign members first.
   *
   * Both checks fire BEFORE the write so a refused attempt leaves no partial state. The deleted
   * role is purged after the role tombstone window — the restore window.
   */
  async delete(
    scope: OrganizationPrincipalDatabaseScope,
    role_public_id: string,
    query: unknown,
    deleted_by_user_public_id: string | undefined,
  ): Promise<void> {
    const organization_public_id = scope.organizationPublicId;
    const removal = validateDeleteMemberRoleQuery(query);
    await withAppDatabaseContext(scope, async () => {
      const organization =
        await this.organizationService.requireOrganizationRecordByPublicId(organization_public_id);
      const role = await this.memberRoleRepository.findByPublicId(role_public_id, organization.id);
      if (!role) throw new NotFoundError('Role');
      if (role.is_system) {
        throw new ForbiddenError('errors:cannotDeleteSystemRole').withReason('system_role_fixed');
      }
      const userId =
        await this.organizationService.resolveUserInternalIdByPublicId(deleted_by_user_public_id);
      // Atomic guarded delete: the "no live members?" check and the soft-delete run in ONE
      // statement (a NOT EXISTS over memberships), so a concurrent member-assignment to this role
      // cannot interleave a separate count and the delete and leave a member on a deleted role —
      // which permission resolution would then silently strip of all permissions (route-audit C2).
      // `role` was found above, so a zero-row result means members remain (or a concurrent
      // delete) → surface the actionable conflict rather than NotFound.
      const deleted = await this.memberRoleRepository.softDeleteIfNoActiveMembers(
        role_public_id,
        organization.id,
        {
          delete_reason: removal.reason,
          delete_note: removal.note ?? null,
          updated_by_user_id: userId ?? null,
        },
      );
      if (!deleted) {
        throw new ConflictError('errors:roleHasActiveMembers');
      }
    });
    // sec-R11: invalidate AFTER the write transaction commits so a concurrent permission recompute
    // cannot re-cache the stale (pre-delete) set for members holding the deleted role.
    await invalidateOrganizationPermissions(organization_public_id);
  }

  /**
   * Undoes a role's delete (launch §2.D route 17, T12) while it is not yet purged.
   *
   * @remarks
   * - **Algorithm:** inside the organization context — the deleted role (409 when live, 404 when
   *   unknown), then the restore; a live role that took the name meanwhile is a 409.
   * - **Failure modes:** `NotFoundError('Role')`; `ConflictError` `record_not_deleted` /
   *   `record_restore_conflict`.
   */
  async restore(
    scope: OrganizationPrincipalDatabaseScope,
    role_public_id: string,
    restored_by_user_public_id: string | undefined,
  ): Promise<MemberRoleOutput> {
    const organization_public_id = scope.organizationPublicId;
    return withAppDatabaseContext(scope, async () => {
      const organization =
        await this.organizationService.requireOrganizationRecordByPublicId(organization_public_id);
      const deleted = await this.memberRoleRepository.findDeletedByPublicId(
        role_public_id,
        organization.id,
      );
      if (!deleted) {
        const live = await this.memberRoleRepository.findByPublicId(
          role_public_id,
          organization.id,
        );
        if (live) {
          throw new ConflictError('errors:recordNotDeleted').withReason('record_not_deleted');
        }
        throw new NotFoundError('Role');
      }
      const userId = await this.organizationService.resolveUserInternalIdByPublicId(
        restored_by_user_public_id,
      );
      let restored: MemberRoleRow | null;
      try {
        restored = await this.memberRoleRepository.restore(
          role_public_id,
          organization.id,
          userId ?? null,
        );
      } catch (error) {
        if (isPostgresUniqueViolation(error)) {
          throw new ConflictError('errors:recordRestoreConflict').withReason(
            'record_restore_conflict',
          );
        }
        throw error;
      }
      if (!restored) throw new NotFoundError('Role');
      const memberCount = await this.memberRoleRepository.countMembersForRole(
        restored.id,
        organization.id,
      );
      return serializeMemberRole(restored, memberCount);
    });
  }
}
