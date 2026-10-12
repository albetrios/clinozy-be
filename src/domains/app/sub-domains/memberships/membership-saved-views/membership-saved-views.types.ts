import type { membership_saved_views } from './membership-saved-views.schema.js';
import type { MembershipSavedViewListKey } from './membership-saved-views.lists.js';

/** A `app.membership_saved_views` row. */
export type MembershipSavedViewRow = typeof membership_saved_views.$inferSelect;

/** A saved view as the API returns it (launch §2.G.6). */
export interface MembershipSavedViewOutput {
  id: string;
  /** Which list the view belongs to (patients, payments, …) */
  list_key: string;
  label: string;
  /** That list's query parameters, without paging and sort */
  filters: Record<string, unknown>;
  hidden_columns: string[];
  created_at: string;
  updated_at: string;
}

/** The parsed `GET /app/memberships/me/saved-views` query. */
export interface MembershipSavedViewListQuery {
  listKey: MembershipSavedViewListKey | undefined;
  q: string | undefined;
  sort: 'created_at' | 'label' | undefined;
  order: 'asc' | 'desc' | undefined;
  limit: number;
  after: string | undefined;
}

/** One page of a member's saved views; `total` (capped) on the first page only. */
export interface MembershipSavedViewPage {
  items: MembershipSavedViewRow[];
  total: number | null;
  limit: number;
  has_more: boolean;
  next_cursor: string | null;
}
