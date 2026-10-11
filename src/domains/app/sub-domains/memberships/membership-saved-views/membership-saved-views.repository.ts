import { and, count, eq, getTableColumns, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import {
  RESOURCE_QUOTA_LOCK_NAMESPACE,
  acquireResourceQuotaLock,
} from '@/infrastructure/database/resource-quota-lock.util.js';
import { countWithCap } from '@/infrastructure/database/utils/capped-count.util.js';
import {
  buildSearchCondition,
  finishKeysetPage,
  resolveKeysetSort,
} from '@/shared/utils/http/list-query.util.js';
import { cursorTimestampSelection } from '@/shared/utils/http/pagination.util.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { runInsertWithPublicIdentifierRetry } from '@/shared/utils/infrastructure/postgres-error.util.js';
import { membership_saved_views } from './membership-saved-views.schema.js';
import type {
  MembershipSavedViewListQuery,
  MembershipSavedViewPage,
  MembershipSavedViewRow,
} from './membership-saved-views.types.js';

/** The label index — its unique violation is `409 view_exists`. */
export const MEMBERSHIP_SAVED_VIEW_LABEL_UNIQUE_INDEX =
  'idx_membership_saved_views_membership_list_label_unique';

/** The columns a save writes. */
export type MembershipSavedViewFields = Partial<
  Pick<MembershipSavedViewRow, 'label' | 'filters' | 'hidden_columns'>
>;

/**
 * Persistence for `app.membership_saved_views` — a member's saved views. Every read and write names
 * the owning membership; runs on the request's database handle, so RLS scopes every statement to
 * the active organization.
 */
export class MembershipSavedViewsRepository {
  /** One page of the membership's views, in the sort asked (oldest first by default). */
  async list(
    membership_id: number,
    query: MembershipSavedViewListQuery,
  ): Promise<MembershipSavedViewPage> {
    const where = and(
      eq(membership_saved_views.membership_id, membership_id),
      query.listKey === undefined ? undefined : eq(membership_saved_views.list_key, query.listKey),
      buildSearchCondition({ columns: [membership_saved_views.label], q: query.q }),
    );
    const { orderBy, cursorCondition, sortValueFor, filterFingerprint } =
      resolveKeysetSort<MembershipSavedViewRow>({
        columns: {
          created_at: { column: membership_saved_views.created_at, kind: 'created_at' },
          label: {
            column: membership_saved_views.label,
            kind: 'text',
            getSortValue: (row) => row.label,
          },
        },
        idColumn: membership_saved_views.id,
        defaultSort: 'created_at',
        sort: query.sort,
        order: query.order,
        q: query.q,
        filters: { list_key: query.listKey ?? null },
        after: query.after,
      });
    const rows = await getRequestDatabase()
      .select({
        ...getTableColumns(membership_saved_views),
        cursor_created_at: cursorTimestampSelection(membership_saved_views.created_at),
      })
      .from(membership_saved_views)
      .where(and(where, cursorCondition))
      .orderBy(...orderBy)
      .limit(query.limit + 1);
    const page = finishKeysetPage({
      rows,
      args: { limit: query.limit, sortValueFor, filterFingerprint },
    });
    // The cursor's timestamp column is the cursor's, not the view's.
    const items = page.items.map(({ cursor_created_at: _cursorCreatedAt, ...row }) => row);
    const total =
      query.after === undefined
        ? await countWithCap({
            database: getRequestDatabase(),
            table: membership_saved_views,
            where,
          })
        : null;
    return { ...page, items, total };
  }

  /** The membership's view with this public id, if it is theirs. */
  async findByPublicId(
    membership_id: number,
    public_id: string,
  ): Promise<MembershipSavedViewRow | undefined> {
    const rows = await getRequestDatabase()
      .select()
      .from(membership_saved_views)
      .where(
        and(
          eq(membership_saved_views.membership_id, membership_id),
          eq(membership_saved_views.public_id, public_id),
        ),
      )
      .limit(1);
    return rows[0];
  }

  /**
   * Serializes saves on one member's list for the rest of the transaction, so the cap count and the
   * insert see the same rows.
   */
  async acquireListLock(membership_id: number, list_key: string): Promise<void> {
    await acquireResourceQuotaLock({
      namespace: RESOURCE_QUOTA_LOCK_NAMESPACE.MEMBERSHIP_SAVED_VIEW,
      key: `${membership_id}:${list_key}`,
    });
  }

  /** How many views the membership has on a list. */
  async countForList(membership_id: number, list_key: string): Promise<number> {
    const rows = await getRequestDatabase()
      .select({ value: count() })
      .from(membership_saved_views)
      .where(
        and(
          eq(membership_saved_views.membership_id, membership_id),
          eq(membership_saved_views.list_key, list_key),
        ),
      );
    return rows[0]?.value ?? 0;
  }

  /** Inserts a view; returns the row. */
  async create(values: {
    organization_id: number;
    membership_id: number;
    list_key: string;
    label: string;
    filters: Record<string, unknown>;
    hidden_columns: string[];
    user_id: number;
  }): Promise<MembershipSavedViewRow> {
    return runInsertWithPublicIdentifierRetry({
      insert: async () => {
        const rows = await getRequestDatabase()
          .insert(membership_saved_views)
          .values({
            public_id: generatePublicId('membershipSavedView'),
            organization_id: values.organization_id,
            membership_id: values.membership_id,
            list_key: values.list_key,
            label: values.label,
            filters: values.filters,
            hidden_columns: values.hidden_columns,
            created_by_user_id: values.user_id,
            updated_by_user_id: values.user_id,
          })
          .returning();
        const row = rows[0];
        if (!row) throw new Error('membership_saved_views insert returned no row');
        return row;
      },
    });
  }

  /** Saves `fields` on a view; returns the row. */
  async update(options: {
    id: number;
    fields: MembershipSavedViewFields;
    user_id: number;
  }): Promise<MembershipSavedViewRow> {
    const rows = await getRequestDatabase()
      .update(membership_saved_views)
      .set({
        ...options.fields,
        updated_at: sql`greatest(${membership_saved_views.created_at}, now())`,
        updated_by_user_id: options.user_id,
      })
      .where(eq(membership_saved_views.id, options.id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error('membership_saved_views update returned no row');
    return row;
  }

  /** Deletes a view for good (U6). */
  async delete(id: number): Promise<void> {
    await getRequestDatabase()
      .delete(membership_saved_views)
      .where(eq(membership_saved_views.id, id));
  }

  /** Deletes every view of the membership — the leave step (K4). */
  async deleteForMembership(options: {
    organization_id: number;
    membership_id: number;
  }): Promise<void> {
    await getRequestDatabase()
      .delete(membership_saved_views)
      .where(
        and(
          eq(membership_saved_views.organization_id, options.organization_id),
          eq(membership_saved_views.membership_id, options.membership_id),
        ),
      );
  }
}
