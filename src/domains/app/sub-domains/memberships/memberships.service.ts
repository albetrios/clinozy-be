import type { MembershipService } from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import type { MemberRoleService } from '@/domains/tenancy/sub-domains/member-roles/member-role.service.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { splitRecordIds } from '@/shared/utils/validation/record-fields.util.js';
import { serializeAppMembership, serializeAppRole } from './memberships.serializer.js';
import type { AppMembershipOutput, AppRoleOutput } from './memberships.types.js';
import {
  validateListAppMembershipsQuery,
  validateListAppRolesQuery,
} from './memberships.validator.js';

/** One page of a directory list. */
interface DirectoryPage<Item> {
  items: Item[];
  limit: number;
  has_more: boolean;
  next_cursor: string | null;
}

/**
 * The team as every member reads it (launch §2.A, T5, K5) — the person pickers on a booking, a
 * treatment or a task, and the member directory that names a `mem_…` id anywhere in the app — and
 * the role directory beside it (launch D81 (4)) that names a `rol_…` id.
 *
 * @remarks
 * - **Algorithm:** one page of the tenancy membership list (T6 — filtered and paged in the query):
 *   live active members by name; `holds` keeps the members one of whose roles grants a code (T8);
 *   `include_ended=true` lists every membership, any status, live or ended; `ids` resolves given
 *   memberships; the slim picker shape — no phone, hours or commission. The roles come from the
 *   tenancy member-role service, in the order they were made, without codes or counts.
 * - **Failure modes:** `ValidationError` for a bad query.
 */
export class AppMembershipsService {
  constructor(
    private readonly membershipService: MembershipService,
    private readonly memberRoleService: MemberRoleService,
  ) {}

  /**
   * One page of the team matching the query, in name order.
   *
   * @remarks
   * - **Algorithm:** see the class; an unknown role or branch matches nobody.
   * - **Failure modes:** `ValidationError`.
   */
  async list(
    scope: OrganizationPrincipalDatabaseScope,
    query: unknown,
  ): Promise<DirectoryPage<AppMembershipOutput>> {
    const parsed = validateListAppMembershipsQuery(query);
    const ids = splitRecordIds(parsed.ids);
    const page = await this.membershipService.listDirectory(scope, {
      q: parsed.q,
      rolePublicId: parsed.role_id,
      branchPublicId: parsed.branch_id,
      holdsPermissionCode: parsed.holds,
      includeEnded: parsed.include_ended === 'true',
      publicIds: ids.length > 0 ? ids : undefined,
      limit: parsed.limit,
      after: parsed.after,
    });
    return {
      items: page.items.map(serializeAppMembership),
      limit: page.limit,
      has_more: page.has_more,
      next_cursor: page.next_cursor,
    };
  }

  /**
   * One page of the organization's roles, in the order they were made — Owner, Admin, the clinic
   * presets, then the custom ones (launch D81 (4)).
   *
   * @remarks
   * - **Algorithm:** {@link MemberRoleService.listDirectory}, then the slim directory shape.
   * - **Failure modes:** `ValidationError` for a bad query.
   */
  async listRoles(
    scope: OrganizationPrincipalDatabaseScope,
    query: unknown,
  ): Promise<DirectoryPage<AppRoleOutput>> {
    const parsed = validateListAppRolesQuery(query);
    const page = await this.memberRoleService.listDirectory(scope, {
      limit: parsed.limit,
      after: parsed.after,
    });
    return {
      items: page.items.map(serializeAppRole),
      limit: page.limit,
      has_more: page.has_more,
      next_cursor: page.next_cursor,
    };
  }
}
