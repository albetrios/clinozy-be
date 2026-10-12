import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { MembershipService } from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import {
  type OrganizationPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors/index.js';
import {
  getPostgresConstraintName,
  isPostgresUniqueViolation,
} from '@/shared/utils/infrastructure/postgres-error.util.js';
import { assertRecordNotChangedSince } from '@/shared/utils/validation/record-fields.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import type { BranchMembersRepository } from './branch-members/branch-members.repository.js';
import {
  membershipNotFoundError,
  resolveMembershipIds,
} from '@/domains/app/sub-domains/memberships/memberships.rules.js';
import type { BranchesRepository } from './branches.repository.js';
import { BranchesSerializer } from './branches.serializer.js';
import type { BranchUpdateData } from './branches.types.js';
import type { CreateBranchInput, UpdateBranchInput } from './branches.dto.js';
import { validateCreateBranch, validateUpdateBranch } from './branches.validator.js';

/** The four default-staff fields: API field (a `mem_` id) → column (the membership's id). */
const DEFAULT_STAFF_FIELDS = [
  'default_doctor_membership_id',
  'default_front_desk_membership_id',
  'default_therapist_membership_id',
  'default_pharmacist_membership_id',
] as const;

type DefaultStaffField = (typeof DEFAULT_STAFF_FIELDS)[number];

/** D10: a default-staff member who does not work at the branch. */
const DEFAULT_STAFF_NOT_MEMBER_KEY = 'errors:validation.defaultStaffNotBranchMember';

/** Unique indexes whose violation is a client conflict, with the message each one gives. */
const UNIQUE_CONFLICT_KEYS: Record<string, string> = {
  idx_branches_organization_name_unique: 'errors:branchNameExists',
  idx_branches_one_main_per_organization: 'errors:branchMainExists',
};

/**
 * Branches of the active organization (launch ROUTE #2): the everyday `my` list every member
 * reads, and the management reads and writes a few hold `branch:*` permissions for.
 *
 * @remarks
 * - **Algorithm:** every call runs inside `withAppDatabaseContext` with the caller's
 *   organization scope, resolves the organization, then reads or writes through the repositories.
 *   `listMine` returns every active branch to a caller who may read all branches, else the
 *   branches in `app.branch_members` for the caller's membership (D9).
 * - **Failure modes:** `NotFoundError('Branch')` for an unknown or foreign branch;
 *   `ValidationError` for a bad body, a default-staff id that is no member here, or a closing time
 *   at or before the opening time; `ConflictError` for a taken name or a second main branch.
 * - **Side effects:** a create gives its creator access to the new branch.
 */
export class BranchesService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly membershipService: MembershipService,
    private readonly branchesRepository: BranchesRepository,
    private readonly branchMembersRepository: BranchMembersRepository,
  ) {}

  async listMine(options: {
    scope: OrganizationPrincipalDatabaseScope;
    userPublicId: string | undefined;
    canReadAllBranches: boolean;
  }) {
    return withAppDatabaseContext({
      scope: options.scope,
      callback: async () => {
        const organization = await this.organizationService.requireOrganizationByPublicId(
          options.scope.organizationPublicId,
        );
        if (options.canReadAllBranches) {
          return BranchesSerializer.summaries(
            await this.branchesRepository.listActiveSummaries(organization.id),
          );
        }
        const userId = await this.organizationService.resolveUserInternalIdByPublicId(
          options.userPublicId,
        );
        if (userId === null || userId === undefined) return [];
        return BranchesSerializer.summaries(
          await this.branchesRepository.listActiveSummariesForUser(organization.id, userId),
        );
      },
    });
  }

  async list(options: { scope: OrganizationPrincipalDatabaseScope; includeInactive: boolean }) {
    return withAppDatabaseContext({
      scope: options.scope,
      callback: async () => {
        const organization = await this.organizationService.requireOrganizationByPublicId(
          options.scope.organizationPublicId,
        );
        return BranchesSerializer.many(
          await this.branchesRepository.listByOrganization(organization.id, {
            include_inactive: options.includeInactive,
          }),
        );
      },
    });
  }

  async get({
    scope,
    branchPublicId,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    branchPublicId: string;
  }) {
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization = await this.organizationService.requireOrganizationByPublicId(
          scope.organizationPublicId,
        );
        const branch = await this.branchesRepository.findByPublicId(
          branchPublicId,
          organization.id,
        );
        if (!branch) throw new NotFoundError('Branch');
        return BranchesSerializer.one(branch);
      },
    });
  }

  async create({
    scope,
    body,
    actingUserPublicId,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    body: unknown;
    actingUserPublicId: string | undefined;
  }) {
    const parsed = validateCreateBranch(body);
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization = await this.organizationService.requireOrganizationByPublicId(
          scope.organizationPublicId,
        );
        const userId =
          (await this.organizationService.resolveUserInternalIdByPublicId(actingUserPublicId)) ??
          undefined;
        const defaultStaff = await this.resolveDefaultStaff({
          organizationId: organization.id,
          input: parsed,
        });
        const { membership_ids: membershipPublicIds, ...fields } = parsed;
        const memberIds =
          membershipPublicIds === undefined
            ? undefined
            : await this.resolveMemberIds({ organizationId: organization.id, membershipPublicIds });
        const created = await this.mapConflicts({
          name: parsed.name,
          write: () =>
            this.branchesRepository.create(
              omitUndefined({
                ...withoutDefaultStaff(fields),
                organization_id: organization.id,
                created_by_user_id: userId,
              }),
            ),
        });
        // D13: who works there from day one — the list given, else the creator.
        if (memberIds !== undefined) {
          await this.branchMembersRepository.replaceForBranch({
            branch_id: created.id,
            organization_id: organization.id,
            membership_ids: [...memberIds],
            created_by_user_id: userId,
          });
        } else if (userId !== undefined) {
          await this.branchMembersRepository.grantToUser({
            branch_id: created.id,
            organization_id: organization.id,
            user_id: userId,
            created_by_user_id: userId,
          });
        }
        // D10: the default staff are among the branch's members (checked against the rows just
        // written, so it holds whichever way the list was given).
        await this.assertDefaultStaffAreMembers({ branchId: created.id, defaultStaff });
        if (Object.keys(defaultStaff).length > 0) {
          await this.branchesRepository.update(created.id, defaultStaff, userId);
        }
        const branch = await this.branchesRepository.findByPublicId(
          created.public_id,
          organization.id,
        );
        return BranchesSerializer.one(branch!);
      },
    });
  }

  async update({
    scope,
    branchPublicId,
    body,
    actingUserPublicId,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    branchPublicId: string;
    body: unknown;
    actingUserPublicId: string | undefined;
  }) {
    const parsed = validateUpdateBranch(body);
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization = await this.organizationService.requireOrganizationByPublicId(
          scope.organizationPublicId,
        );
        const existing = await this.branchesRepository.findByPublicId(
          branchPublicId,
          organization.id,
        );
        if (!existing) throw new NotFoundError('Branch');
        // C12 / D43: a save based on an older version is refused with who and when.
        await assertRecordNotChangedSince({
          row: existing,
          expected: parsed.expected_updated_at,
          resolveUserPublicId: (userInternalId) =>
            this.organizationService.resolveUserPublicIdByInternalId(userInternalId),
        });
        assertClosesAfterOpens({
          opens_at: parsed.opens_at ?? existing.opens_at.slice(0, 5),
          closes_at: parsed.closes_at ?? existing.closes_at.slice(0, 5),
        });
        const userId =
          (await this.organizationService.resolveUserInternalIdByPublicId(actingUserPublicId)) ??
          undefined;
        const defaultStaff = await this.resolveDefaultStaff({
          organizationId: organization.id,
          input: parsed,
        });
        await this.assertDefaultStaffAreMembers({ branchId: existing.id, defaultStaff });
        const { expected_updated_at: _expectedUpdatedAt, ...fields } = parsed;
        const changes: BranchUpdateData = omitUndefined({
          ...withoutDefaultStaff(fields),
          ...defaultStaff,
        });
        const updated = await this.mapConflicts({
          name: parsed.name ?? existing.name,
          write: () => this.branchesRepository.update(existing.id, changes, userId),
        });
        if (!updated) throw new NotFoundError('Branch');
        const branch = await this.branchesRepository.findByPublicId(
          branchPublicId,
          organization.id,
        );
        return BranchesSerializer.one(branch!);
      },
    });
  }

  /**
   * Turns the default-staff `mem_` ids in a body into membership ids; `null` clears a field and an
   * absent field stays absent. An id that is no live member of this organization is a 400.
   */
  private async resolveDefaultStaff({
    organizationId,
    input,
  }: {
    organizationId: number;
    input: Partial<Record<DefaultStaffField, string | null | undefined>>;
  }): Promise<Partial<Record<DefaultStaffField, number | null>>> {
    const requested = DEFAULT_STAFF_FIELDS.flatMap((field) => {
      const value = input[field];
      return typeof value === 'string' ? [{ field, publicId: value }] : [];
    });
    const resolved = await this.membershipService.resolveMembershipIdsByPublicIds({
      organizationId,
      membershipPublicIds: requested.map((entry) => entry.publicId),
    });
    const result: Partial<Record<DefaultStaffField, number | null>> = {};
    for (const field of DEFAULT_STAFF_FIELDS) {
      if (input[field] === null) result[field] = null;
    }
    for (const { field, publicId } of requested) {
      const membershipId = resolved.get(publicId);
      if (membershipId === undefined) {
        throw membershipNotFoundError({ field, membershipPublicIds: [publicId] });
      }
      result[field] = membershipId;
    }
    return result;
  }

  /** `membership_ids` → live membership ids of this organization; an unknown one is a 400. */
  private async resolveMemberIds({
    organizationId,
    membershipPublicIds,
  }: {
    organizationId: number;
    membershipPublicIds: readonly string[];
  }): Promise<Set<number>> {
    const resolved = await resolveMembershipIds({
      membershipService: this.membershipService,
      organizationId,
      membershipPublicIds,
    });
    return new Set(resolved.values());
  }

  /** D10: every default-staff member named is one of the branch's live members, else a 400. */
  private async assertDefaultStaffAreMembers({
    branchId,
    defaultStaff,
  }: {
    branchId: number;
    defaultStaff: Partial<Record<DefaultStaffField, number | null>>;
  }): Promise<void> {
    const named = DEFAULT_STAFF_FIELDS.filter((field) => typeof defaultStaff[field] === 'number');
    if (named.length === 0) return;
    const members = await this.branchMembersRepository.listLiveMembershipIds(branchId);
    const outside = named.filter((field) => !members.has(defaultStaff[field] as number));
    if (outside.length > 0) {
      throw new ValidationError(
        DEFAULT_STAFF_NOT_MEMBER_KEY,
        { field: outside[0]! },
        undefined,
        outside.map((field) => ({
          field,
          messageKey: DEFAULT_STAFF_NOT_MEMBER_KEY,
          messageParams: { field },
        })),
      );
    }
  }

  /** Runs a write; a taken name or a second main branch becomes a 409. */
  private async mapConflicts<T>({
    name,
    write,
  }: {
    name: string;
    write: () => Promise<T>;
  }): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        const key = UNIQUE_CONFLICT_KEYS[getPostgresConstraintName(error) ?? ''];
        if (key) throw new ConflictError(key, { name });
      }
      throw error;
    }
  }
}

/** The body without its default-staff fields (they are written as resolved ids). */
function withoutDefaultStaff<T extends CreateBranchInput | UpdateBranchInput>(
  input: T,
): Omit<T, DefaultStaffField> {
  const {
    default_doctor_membership_id: _doctor,
    default_front_desk_membership_id: _frontDesk,
    default_therapist_membership_id: _therapist,
    default_pharmacist_membership_id: _pharmacist,
    ...rest
  } = input;
  return rest;
}

/** A merged update (body over the stored row) must still close after it opens. */
function assertClosesAfterOpens(hours: { opens_at: string; closes_at: string }): void {
  if (hours.closes_at <= hours.opens_at) {
    throw new ValidationError('errors:validation.branchClosesBeforeOpens', undefined, undefined, [
      { field: 'closes_at', messageKey: 'errors:validation.branchClosesBeforeOpens' },
    ]);
  }
}
