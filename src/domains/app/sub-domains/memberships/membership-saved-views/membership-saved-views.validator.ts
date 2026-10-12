import { ValidationError } from '@/shared/errors/index.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  type CreateMembershipSavedViewInput,
  createMembershipSavedViewDto,
  listMembershipSavedViewsQueryDto,
  type UpdateMembershipSavedViewInput,
  updateMembershipSavedViewDto,
} from './membership-saved-views.dto.js';
import {
  MEMBERSHIP_SAVED_VIEW_LIST_FILTERS,
  type MembershipSavedViewListKey,
} from './membership-saved-views.lists.js';
import type { MembershipSavedViewListQuery } from './membership-saved-views.types.js';

const FILTER_NOT_TAKEN_KEY = 'errors:validation.savedViewFilterNotTaken';

/** Parses a saved-view create body; throws `ValidationError` naming each bad field. */
export function validateCreateMembershipSavedView(data: unknown): CreateMembershipSavedViewInput {
  return parseWithSchema({ schema: createMembershipSavedViewDto, data });
}

/** Parses a saved-view update body; throws `ValidationError` naming each bad field. */
export function validateUpdateMembershipSavedView(data: unknown): UpdateMembershipSavedViewInput {
  return parseWithSchema({ schema: updateMembershipSavedViewDto, data });
}

/** Parses the `GET /app/memberships/me/saved-views` query. */
export function validateListMembershipSavedViewsQuery(data: unknown): MembershipSavedViewListQuery {
  const query = parseWithSchema({ schema: listMembershipSavedViewsQueryDto, data });
  return {
    listKey: query.list_key,
    q: query.q,
    sort: query.sort,
    order: query.order,
    limit: query.limit,
    after: query.after,
  };
}

/**
 * A view's `filters` must be filters its list takes (launch U5) — the list's own query parameters,
 * without paging and sort, each with a value the list accepts.
 *
 * @remarks
 * - **Algorithm:** the list's filter schema (strict) over `filters`; every failing parameter is
 *   named.
 * - **Failure modes:** `ValidationError` on `filters` (`errors:validation.savedViewFilterNotTaken`).
 */
export function assertSavedViewFiltersTaken(options: {
  listKey: MembershipSavedViewListKey;
  filters: Record<string, unknown>;
}): void {
  const result = MEMBERSHIP_SAVED_VIEW_LIST_FILTERS[options.listKey].safeParse(options.filters);
  if (result.success) return;
  const names = new Set<string>();
  for (const issue of result.error.issues) {
    if (issue.code === 'unrecognized_keys') for (const key of issue.keys) names.add(key);
    else names.add(String(issue.path[0] ?? ''));
  }
  const params = { filter: [...names].filter(Boolean).join(', '), list_key: options.listKey };
  throw new ValidationError(FILTER_NOT_TAKEN_KEY, params, undefined, [
    { field: 'filters', messageKey: FILTER_NOT_TAKEN_KEY, messageParams: params },
  ]);
}
