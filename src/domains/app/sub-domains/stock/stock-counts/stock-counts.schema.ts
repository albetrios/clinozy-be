import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  foreignKey,
  index,
  numeric,
  pgPolicy,
  primaryKey,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { stock_items } from '@/domains/app/sub-domains/stock/stock-items/stock-items.schema.js';

/**
 * Drizzle table for `app.stock_counts` — one stock check (launch ROUTE #137, routes-final 9.C).
 *
 * @remarks
 * - **Notes:** never changed or deleted — it moved stock (S9), so no `updated_*` or soft-delete
 *   columns; what it counted is `app.stock_count_lines`, and each difference an `adjust` movement.
 *   The author a K8 composite key `RESTRICT` (K2). RLS on the organization GUC; no branch (S3).
 */
export const stock_counts = appSchema
  .table(
    'stock_counts',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      counted_at: timestamp('counted_at', { withTimezone: true }).notNull().defaultNow(),
      // The caller (the design's "By")
      author_membership_id: bigint('author_membership_id', { mode: 'number' }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      uniqueIndex('idx_stock_counts_public_id').on(table.public_id),
      // Past stock checks, newest first
      index('idx_stock_counts_organization_counted_at').on(
        table.organization_id,
        table.counted_at.desc(),
        table.id,
      ),
      index('idx_stock_counts_author_membership_id')
        .on(table.organization_id, table.author_membership_id)
        .where(sql`${table.author_membership_id} IS NOT NULL`),
      index('idx_stock_counts_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      // K8: a member of this organization, kept when they leave (K2)
      foreignKey({
        name: 'stock_counts_author_membership_fk',
        columns: [table.organization_id, table.author_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      pgPolicy('stock_counts_tenant_isolation', {
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

/**
 * Drizzle table `app.stock_count_lines` — what one stock check counted for one item (S9), no public
 * id (part of the count, written with it).
 *
 * @remarks
 * - **Notes:** the system quantity is the item's balance when the count was saved (the server's,
 *   never sent); each item once per count (the key); the rows go with their count (`CASCADE`), an
 *   item they name stays (`RESTRICT`). RLS is the organization policy.
 */
export const stock_count_lines = appSchema
  .table(
    'stock_count_lines',
    {
      stock_count_id: bigint('stock_count_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => stock_counts.id, { onDelete: 'cascade' }),
      stock_item_id: bigint('stock_item_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => stock_items.id, { onDelete: 'restrict' }),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      system_quantity: numeric('system_quantity', { precision: 12, scale: 3 }).notNull(),
      counted_quantity: numeric('counted_quantity', { precision: 12, scale: 3 }).notNull(),
    },
    (table) => [
      primaryKey({
        name: 'stock_count_lines_pkey',
        columns: [table.stock_count_id, table.stock_item_id],
      }),
      index('idx_stock_count_lines_stock_item_id').on(table.stock_item_id),
      check('chk_stock_count_lines_system_quantity', sql`${table.system_quantity} >= 0`),
      check('chk_stock_count_lines_counted_quantity', sql`${table.counted_quantity} >= 0`),
      pgPolicy('stock_count_lines_tenant_isolation', {
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
