import type { MembershipService } from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import type { MembershipOutput } from '@/domains/tenancy/sub-domains/membership/membership.types.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { PAGINATION } from '@/shared/constants/pagination.constants.js';
import { serializeAppUser } from './users.serializer.js';
import type { AppUserOutput } from './users.types.js';
import { validateListAppUsersQuery } from './users.validator.js';

/** The most pages a picker reads (a team of up to 500 people). */
const USER_PAGE_LIMIT = 5;

/**
 * The team as every role reads it (launch RC-11) — staff, doctors and therapists are users filtered by role — every role reads it, so a doctor, therapist
 * or owner can be picked on a booking, a treatment or a task without the team admin route.
 *
 * @remarks
 * - **Algorithm:** reads the organization's memberships through the tenancy service (pages of
 *   100, at most 5), keeps the active ones, narrows by role (any held role) and branch, and
 *   returns the slim picker shape — no phone, hours or commission.
 * - **Failure modes:** `ValidationError` for a bad query.
 */
export class AppUsersService {
  constructor(private readonly membershipService: MembershipService) {}

  /**
   * The active team members matching the query, in name order.
   *
   * @remarks
   * - **Algorithm:** see the class; an unknown role or branch matches nobody.
   * - **Failure modes:** `ValidationError`.
   */
  async list(scope: OrganizationPrincipalDatabaseScope, query: unknown): Promise<AppUserOutput[]> {
    const { q, role_id: roleId, branch_id: branchId } = validateListAppUsersQuery(query);
    const members: MembershipOutput[] = [];
    let after: string | undefined;
    for (let page = 0; page < USER_PAGE_LIMIT; page += 1) {
      const result = await this.membershipService.list(scope, {
        limit: PAGINATION.MAX_LIMIT,
        sort: 'name',
        ...(q === undefined ? {} : { q }),
        ...(after === undefined ? {} : { after }),
      });
      members.push(...result.items);
      if (!(result.has_more && result.next_cursor)) break;
      after = result.next_cursor;
    }
    return members
      .filter((member) => member.status === 'ACTIVE')
      .filter((member) => roleId === undefined || member.role_ids.includes(roleId))
      .filter((member) => branchId === undefined || member.branch_ids.includes(branchId))
      .map(serializeAppUser);
  }
}
