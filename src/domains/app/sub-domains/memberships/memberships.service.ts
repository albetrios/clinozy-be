import type { MembershipService } from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { splitRecordIds } from '@/shared/utils/validation/record-fields.util.js';
import { serializeAppMembership } from './memberships.serializer.js';
import type { AppMembershipOutput } from './memberships.types.js';
import { validateListAppMembershipsQuery } from './memberships.validator.js';

/**
 * The team as every member reads it (launch §2.A, T5, K5) — the person pickers on a booking, a
 * treatment or a task, and the member directory that names a `mem_…` id anywhere in the app.
 *
 * @remarks
 * - **Algorithm:** one page of the tenancy membership list (T6 — filtered and paged in the query):
 *   live active members by name; `include_ended=true` lists every membership, any status, live or
 *   ended; `ids` resolves given memberships; the slim picker shape — no phone, hours or commission.
 * - **Failure modes:** `ValidationError` for a bad query.
 */
export class AppMembershipsService {
  constructor(private readonly membershipService: MembershipService) {}

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
  ): Promise<{
    items: AppMembershipOutput[];
    limit: number;
    has_more: boolean;
    next_cursor: string | null;
  }> {
    const parsed = validateListAppMembershipsQuery(query);
    const ids = splitRecordIds(parsed.ids);
    const page = await this.membershipService.listDirectory(scope, {
      q: parsed.q,
      rolePublicId: parsed.role_id,
      branchPublicId: parsed.branch_id,
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
}
