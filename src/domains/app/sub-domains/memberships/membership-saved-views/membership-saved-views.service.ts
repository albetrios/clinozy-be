import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import {
  type CallerMembership,
  requireCallerMembership,
} from '@/domains/app/sub-domains/memberships/memberships.rules.js';
import {
  type OrganizationPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { ConflictError, NotFoundError } from '@/shared/errors/index.js';
import {
  getPostgresConstraintName,
  isPostgresUniqueViolation,
} from '@/shared/utils/infrastructure/postgres-error.util.js';
import { assertRecordNotChangedSince } from '@/shared/utils/validation/record-fields.util.js';
import { MEMBERSHIP_SAVED_VIEWS_PER_LIST_MAX } from './membership-saved-views.constants.js';
import type { MembershipSavedViewListKey } from './membership-saved-views.lists.js';
import {
  MEMBERSHIP_SAVED_VIEW_LABEL_UNIQUE_INDEX,
  type MembershipSavedViewFields,
  type MembershipSavedViewsRepository,
} from './membership-saved-views.repository.js';
import { serializeMembershipSavedView } from './membership-saved-views.serializer.js';
import type { MembershipSavedViewOutput } from './membership-saved-views.types.js';
import {
  assertSavedViewFiltersTaken,
  validateCreateMembershipSavedView,
  validateListMembershipSavedViewsQuery,
  validateUpdateMembershipSavedView,
} from './membership-saved-views.validator.js';

/**
 * A page of a member's saved views, as the routes answer it.
 *
 * @remarks
 * - **Notes:** `total` is the capped count, on the first page only (`estimated_total`).
 */
export interface MembershipSavedViewsListResult {
  items: MembershipSavedViewOutput[];
  total: number | null;
  limit: number;
  has_more: boolean;
  next_cursor: string | null;
}

/**
 * A member's own saved views (launch §2.G, U1/U5/U6) — a list's filters under a label, the chips
 * of a list's "Save as view". A member only ever reaches their own; another member's is a 404.
 *
 * @remarks
 * - **Algorithm:** inside the caller's `withAppDatabaseContext`, resolve the caller's own
 *   membership (403 for an API key), then read or write their rows only. A save checks `filters`
 *   against the list's own query parameters; a create counts the list's views under a
 *   per-(membership, list) advisory lock before inserting.
 * - **Failure modes:** `ForbiddenError('errors:ownMembershipRequired')`; `NotFoundError('Saved
 *   view')`; `ValidationError` (`list_key`, `filters`); `ConflictError` `view_exists`,
 *   `view_limit`, `record_changed`.
 * - **Side effects:** inserts, updates and hard-deletes `app.membership_saved_views` rows (U6).
 */
export class MembershipSavedViewsService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly repository: MembershipSavedViewsRepository,
  ) {}

  /**
   * One page of the caller's views — one list's with `list_key`, oldest first by default.
   *
   * @remarks
   * - **Algorithm:** keyset page over the caller's rows; the capped total on the first page.
   * - **Failure modes:** `ValidationError` for a bad query.
   */
  async list(
    scope: OrganizationPrincipalDatabaseScope,
    query: unknown,
    actingUserPublicId: string | undefined,
  ): Promise<MembershipSavedViewsListResult> {
    const parsed = validateListMembershipSavedViewsQuery(query);
    return withAppDatabaseContext(scope, async () => {
      const caller = await this.requireCaller(scope, actingUserPublicId);
      const page = await this.repository.list(caller.membershipId, parsed);
      return { ...page, items: page.items.map(serializeMembershipSavedView) };
    });
  }

  /**
   * One of the caller's views.
   *
   * @remarks
   * - **Algorithm:** a read by public id within the caller's rows.
   * - **Failure modes:** `NotFoundError('Saved view')` when it is not theirs.
   */
  async get(
    scope: OrganizationPrincipalDatabaseScope,
    savedViewPublicId: string,
    actingUserPublicId: string | undefined,
  ): Promise<MembershipSavedViewOutput> {
    return withAppDatabaseContext(scope, async () => {
      const caller = await this.requireCaller(scope, actingUserPublicId);
      return serializeMembershipSavedView(await this.requireOwnView(caller, savedViewPublicId));
    });
  }

  /**
   * Saves a view on a list (U5).
   *
   * @remarks
   * - **Algorithm:** parse and check the filters; lock the caller's list, refuse the 21st view,
   *   insert.
   * - **Failure modes:** `ValidationError`; `ConflictError` `view_limit` and `view_exists`.
   */
  async create(
    scope: OrganizationPrincipalDatabaseScope,
    body: unknown,
    actingUserPublicId: string | undefined,
  ): Promise<MembershipSavedViewOutput> {
    const parsed = validateCreateMembershipSavedView(body);
    assertSavedViewFiltersTaken({ listKey: parsed.list_key, filters: parsed.filters });
    return withAppDatabaseContext(scope, async () => {
      const caller = await this.requireCaller(scope, actingUserPublicId);
      await this.repository.acquireListLock(caller.membershipId, parsed.list_key);
      const onList = await this.repository.countForList(caller.membershipId, parsed.list_key);
      if (onList >= MEMBERSHIP_SAVED_VIEWS_PER_LIST_MAX) {
        throw new ConflictError('errors:savedViewLimit', {
          max: MEMBERSHIP_SAVED_VIEWS_PER_LIST_MAX,
        }).withReason('view_limit');
      }
      const row = await this.withLabelConflict(() =>
        this.repository.create({
          organization_id: caller.organizationId,
          membership_id: caller.membershipId,
          list_key: parsed.list_key,
          label: parsed.label,
          filters: parsed.filters,
          hidden_columns: parsed.hidden_columns ?? [],
          user_id: caller.userId,
        }),
      );
      return serializeMembershipSavedView(row);
    });
  }

  /**
   * Renames a view or changes its filters or hidden columns; its list never changes.
   *
   * @remarks
   * - **Algorithm:** the caller's row (404 otherwise); `expected_updated_at`; filters checked
   *   against the view's list; update.
   * - **Failure modes:** `ValidationError`; `ConflictError` `view_exists` and `record_changed`.
   */
  async update(
    scope: OrganizationPrincipalDatabaseScope,
    savedViewPublicId: string,
    body: unknown,
    actingUserPublicId: string | undefined,
  ): Promise<MembershipSavedViewOutput> {
    const parsed = validateUpdateMembershipSavedView(body);
    return withAppDatabaseContext(scope, async () => {
      const caller = await this.requireCaller(scope, actingUserPublicId);
      const existing = await this.requireOwnView(caller, savedViewPublicId);
      await assertRecordNotChangedSince({
        row: existing,
        expected: parsed.expected_updated_at,
        resolveUserPublicId: (userInternalId) =>
          this.organizationService.resolveUserPublicIdByInternalId(userInternalId),
      });
      if (parsed.filters !== undefined) {
        assertSavedViewFiltersTaken({
          listKey: existing.list_key as MembershipSavedViewListKey,
          filters: parsed.filters,
        });
      }
      const fields: MembershipSavedViewFields = {
        ...(parsed.label === undefined ? {} : { label: parsed.label }),
        ...(parsed.filters === undefined ? {} : { filters: parsed.filters }),
        ...(parsed.hidden_columns === undefined ? {} : { hidden_columns: parsed.hidden_columns }),
      };
      const row = await this.withLabelConflict(() =>
        this.repository.update({ id: existing.id, fields, user_id: caller.userId }),
      );
      return serializeMembershipSavedView(row);
    });
  }

  /**
   * Removes one of the caller's views for good (U6 — no restore).
   *
   * @remarks
   * - **Algorithm:** the caller's row (404 otherwise), then a hard delete.
   * - **Failure modes:** `NotFoundError('Saved view')`.
   */
  async remove(
    scope: OrganizationPrincipalDatabaseScope,
    savedViewPublicId: string,
    actingUserPublicId: string | undefined,
  ): Promise<void> {
    await withAppDatabaseContext(scope, async () => {
      const caller = await this.requireCaller(scope, actingUserPublicId);
      const existing = await this.requireOwnView(caller, savedViewPublicId);
      await this.repository.delete(existing.id);
    });
  }

  private requireCaller(
    scope: OrganizationPrincipalDatabaseScope,
    actingUserPublicId: string | undefined,
  ): Promise<CallerMembership> {
    return requireCallerMembership({
      organizationService: this.organizationService,
      scope,
      actingUserPublicId,
    });
  }

  private async requireOwnView(caller: CallerMembership, savedViewPublicId: string) {
    const row = await this.repository.findByPublicId(caller.membershipId, savedViewPublicId);
    if (!row) throw new NotFoundError('Saved view');
    return row;
  }

  /** A label already used on the member's list is `409 view_exists` (the unique index). */
  private async withLabelConflict<Result>(write: () => Promise<Result>): Promise<Result> {
    try {
      return await write();
    } catch (error) {
      if (
        isPostgresUniqueViolation(error) &&
        getPostgresConstraintName(error) === MEMBERSHIP_SAVED_VIEW_LABEL_UNIQUE_INDEX
      ) {
        throw new ConflictError('errors:savedViewExists').withReason('view_exists');
      }
      throw error;
    }
  }
}
