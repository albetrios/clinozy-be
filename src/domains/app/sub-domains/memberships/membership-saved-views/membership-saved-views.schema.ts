import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  foreignKey,
  index,
  jsonb,
  pgPolicy,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { MEMBERSHIP_SAVED_VIEW_HIDDEN_COLUMNS_MAX } from './membership-saved-views.constants.js';

/**
 * Drizzle table for `app.membership_saved_views` — a list's filters under a label, the member's own
 * shortcut (launch §2.G; renamed from `saved_views` at ROUTE #127, U1/U5). Removed for good (U6) —
 * no soft delete; the leave step deletes a member's views (K4). The member pointer is composite
 * `(organization_id, membership_id)` (K8); a label is unique per member and list, case-insensitive.
 * RLS is the `membership_saved_views_tenant_isolation` policy on the organization GUC.
 */
export const membership_saved_views = appSchema
  .table(
    'membership_saved_views',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      membership_id: bigint('membership_id', { mode: 'number' }).notNull(),
      // Which list the view belongs to — a key of the saved-view list registry
      list_key: varchar('list_key', { length: 40 }).notNull(),
      label: varchar('label', { length: 60 }).notNull(),
      // That list's query parameters, without paging and sort
      filters: jsonb('filters').notNull().default({}),
      hidden_columns: text('hidden_columns').array().notNull().default([]),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
      updated_by_user_id: bigint('updated_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      // K8: a member of this organization; the membership purge cascades the rows.
      foreignKey({
        name: 'membership_saved_views_membership_fk',
        columns: [table.organization_id, table.membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('cascade'),
      uniqueIndex('idx_membership_saved_views_public_id').on(table.public_id),
      // U5: a label once per member and list (`409 view_exists`).
      uniqueIndex('idx_membership_saved_views_membership_list_label_unique').on(
        table.membership_id,
        table.list_key,
        sql`lower(${table.label})`,
      ),
      // Every read filters by the owner (U5): the chips of one list, oldest first.
      index('idx_membership_saved_views_membership_list_created').on(
        table.membership_id,
        table.list_key,
        table.created_at,
      ),
      // Backs the organization key and the composite membership key.
      index('idx_membership_saved_views_organization_id_membership_id').on(
        table.organization_id,
        table.membership_id,
      ),
      index('idx_membership_saved_views_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_membership_saved_views_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_membership_saved_views_list_key', sql`${table.list_key} ~ '^[a-z_]+$'`),
      check('chk_membership_saved_views_label', sql`char_length(btrim(${table.label})) >= 1`),
      check('chk_membership_saved_views_filters', sql`jsonb_typeof(${table.filters}) = 'object'`),
      check(
        'chk_membership_saved_views_hidden_columns',
        sql`cardinality(${table.hidden_columns}) <= ${sql.raw(String(MEMBERSHIP_SAVED_VIEW_HIDDEN_COLUMNS_MAX))}`,
      ),
      check('chk_membership_saved_views_updated', sql`${table.updated_at} >= ${table.created_at}`),
      pgPolicy('membership_saved_views_tenant_isolation', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.organization_id} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`,
        withCheck: sql`${table.organization_id} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`,
      }),
    ],
  )
  .enableRLS();
