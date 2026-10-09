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
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema } from '@/infrastructure/database/pg-schemas.js';
import { sqlLiteral, sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { patient_treatments } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.schema.js';
import { stock_counts } from '@/domains/app/sub-domains/stock/stock-counts/stock-counts.schema.js';
import { stock_items } from '@/domains/app/sub-domains/stock/stock-items/stock-items.schema.js';
import { stock_purchases } from '@/domains/app/sub-domains/stock/stock-purchases/stock-purchases.schema.js';
import {
  STOCK_ITEM_MOVEMENT_ADDING_TYPE_VALUES,
  STOCK_ITEM_MOVEMENT_REVERT_REASON,
  STOCK_ITEM_MOVEMENT_REVERT_REASON_VALUES,
  STOCK_ITEM_MOVEMENT_TAKING_TYPE_VALUES,
  STOCK_ITEM_MOVEMENT_TYPE,
  STOCK_ITEM_MOVEMENT_TYPE_VALUES,
} from '@/domains/app/sub-domains/stock/stock-item-movements/stock-item-movements.constants.js';

/**
 * Drizzle table for `app.stock_item_movements` — every change to an item's quantity, one row each
 * (launch ROUTE #137, routes-final 9.B).
 *
 * @remarks
 * - **Notes:** append-only — no `updated_*` or soft-delete columns (S5); a wrong one is reverted
 *   by a `reverted` row pointing at it, once (`idx_stock_item_movements_reverts`, S8). The type
 *   fixes the sign (S7); `quantity_after` is the balance it left. What made it: a treatment
 *   session (`used` only, S14), a purchase (`received` and its reverts), a count (`adjust`). The
 *   author a K8 composite key `RESTRICT` (K2). RLS on the organization GUC; no branch (S3).
 */
export const stock_item_movements = appSchema
  .table(
    'stock_item_movements',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      stock_item_id: bigint('stock_item_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => stock_items.id, { onDelete: 'restrict' }),
      type: varchar('type', { length: 8 }).notNull(),
      // Signed — the type fixes the sign (S7)
      quantity_change: numeric('quantity_change', { precision: 12, scale: 3 }).notNull(),
      // The balance this row left
      quantity_after: numeric('quantity_after', { precision: 12, scale: 3 }).notNull(),
      used_for: varchar('used_for', { length: 80 }),
      // The design's Remark
      note: varchar('note', { length: 280 }),
      // The treatment session the stock went into (S14)
      patient_treatment_id: bigint('patient_treatment_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_treatments.id,
        { onDelete: 'restrict' },
      ),
      stock_purchase_id: bigint('stock_purchase_id', { mode: 'number' }).references(
        (): AnyPgColumn => stock_purchases.id,
        { onDelete: 'restrict' },
      ),
      stock_count_id: bigint('stock_count_id', { mode: 'number' }).references(
        (): AnyPgColumn => stock_counts.id,
        { onDelete: 'restrict' },
      ),
      reverts_stock_item_movement_id: bigint('reverts_stock_item_movement_id', {
        mode: 'number',
      }).references((): AnyPgColumn => stock_item_movements.id, { onDelete: 'restrict' }),
      revert_reason: varchar('revert_reason', { length: 14 }),
      // The caller (the design's "By")
      author_membership_id: bigint('author_membership_id', { mode: 'number' }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      uniqueIndex('idx_stock_item_movements_public_id').on(table.public_id),
      // An item's history, newest first
      index('idx_stock_item_movements_stock_item_created').on(
        table.stock_item_id,
        table.created_at.desc(),
        table.id,
      ),
      // The Movements tab, newest first
      index('idx_stock_item_movements_organization_created').on(
        table.organization_id,
        table.created_at.desc(),
        table.id,
      ),
      index('idx_stock_item_movements_stock_purchase_id')
        .on(table.stock_purchase_id)
        .where(sql`${table.stock_purchase_id} IS NOT NULL`),
      index('idx_stock_item_movements_stock_count_id')
        .on(table.stock_count_id)
        .where(sql`${table.stock_count_id} IS NOT NULL`),
      index('idx_stock_item_movements_patient_treatment_id')
        .on(table.patient_treatment_id)
        .where(sql`${table.patient_treatment_id} IS NOT NULL`),
      // A movement is reverted once (S8)
      uniqueIndex('idx_stock_item_movements_reverts')
        .on(table.reverts_stock_item_movement_id)
        .where(sql`${table.reverts_stock_item_movement_id} IS NOT NULL`),
      index('idx_stock_item_movements_author_membership_id')
        .on(table.organization_id, table.author_membership_id)
        .where(sql`${table.author_membership_id} IS NOT NULL`),
      index('idx_stock_item_movements_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      // K8: a member of this organization, kept when they leave (K2)
      foreignKey({
        name: 'stock_item_movements_author_membership_fk',
        columns: [table.organization_id, table.author_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      check(
        'chk_stock_item_movements_type',
        sql`${table.type} IN (${sqlLiteralList(STOCK_ITEM_MOVEMENT_TYPE_VALUES)})`,
      ),
      // S7: the type fixes the sign; never 0
      check(
        'chk_stock_item_movements_sign',
        sql`${table.quantity_change} <> 0
          AND (${table.type} NOT IN (${sqlLiteralList(STOCK_ITEM_MOVEMENT_ADDING_TYPE_VALUES)}) OR ${table.quantity_change} > 0)
          AND (${table.type} NOT IN (${sqlLiteralList(STOCK_ITEM_MOVEMENT_TAKING_TYPE_VALUES)}) OR ${table.quantity_change} < 0)`,
      ),
      check('chk_stock_item_movements_quantity_after', sql`${table.quantity_after} >= 0`),
      check(
        'chk_stock_item_movements_used_for',
        sql`${table.used_for} IS NULL OR ${table.type} = ${sqlLiteral(STOCK_ITEM_MOVEMENT_TYPE.USED)}`,
      ),
      // S14: a session only on a use
      check(
        'chk_stock_item_movements_patient_treatment',
        sql`${table.patient_treatment_id} IS NULL OR ${table.type} = ${sqlLiteral(STOCK_ITEM_MOVEMENT_TYPE.USED)}`,
      ),
      check(
        'chk_stock_item_movements_stock_purchase',
        sql`${table.stock_purchase_id} IS NULL OR ${table.type} IN (${sqlLiteralList([STOCK_ITEM_MOVEMENT_TYPE.RECEIVED, STOCK_ITEM_MOVEMENT_TYPE.REVERTED])})`,
      ),
      check(
        'chk_stock_item_movements_stock_count',
        sql`${table.stock_count_id} IS NULL OR ${table.type} = ${sqlLiteral(STOCK_ITEM_MOVEMENT_TYPE.ADJUST)}`,
      ),
      // S8: a revert points at what it undoes, with its reason
      check(
        'chk_stock_item_movements_reverts',
        sql`(${table.type} = ${sqlLiteral(STOCK_ITEM_MOVEMENT_TYPE.REVERTED)}) = (${table.reverts_stock_item_movement_id} IS NOT NULL)
          AND (${table.type} = ${sqlLiteral(STOCK_ITEM_MOVEMENT_TYPE.REVERTED)}) = (${table.revert_reason} IS NOT NULL)`,
      ),
      check(
        'chk_stock_item_movements_revert_reason',
        sql`${table.revert_reason} IN (${sqlLiteralList(STOCK_ITEM_MOVEMENT_REVERT_REASON_VALUES)})`,
      ),
      check(
        'chk_stock_item_movements_note_when_other',
        sql`${table.revert_reason} IS DISTINCT FROM ${sqlLiteral(STOCK_ITEM_MOVEMENT_REVERT_REASON.OTHER)} OR ${table.note} IS NOT NULL`,
      ),
      pgPolicy('stock_item_movements_tenant_isolation', {
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
