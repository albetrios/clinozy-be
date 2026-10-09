import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgPolicy,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import {
  medicine_batches,
  medicines,
} from '@/domains/app/sub-domains/medical/medicines/medicines.schema.js';
import { suppliers } from '@/domains/app/sub-domains/medical/suppliers/suppliers.schema.js';

/**
 * Drizzle table for `app.supplier_credits` — stock returned to a supplier, owed back (launch
 * ROUTE #153, routes-final 11.C, MD11).
 *
 * @remarks
 * - **Notes:** `amount` = quantity × the batch's purchase rate; `applied_amount` is what has been
 *   set against the supplier's received orders (their `credited_amount`) — open until it reaches
 *   the amount. Never changed but for the applied amount, never deleted; the supplier, medicine and
 *   batch stay (`RESTRICT`); the member who returned it is K8's composite key (`RESTRICT`, K2). RLS
 *   on the organization GUC.
 */
export const supplier_credits = appSchema
  .table(
    'supplier_credits',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      supplier_id: bigint('supplier_id', { mode: 'number' })
        .notNull()
        .references(() => suppliers.id, { onDelete: 'restrict' }),
      medicine_id: bigint('medicine_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => medicines.id, { onDelete: 'restrict' }),
      medicine_batch_id: bigint('medicine_batch_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => medicine_batches.id, { onDelete: 'restrict' }),
      quantity: integer('quantity').notNull(),
      rate: numeric('rate', { precision: 12, scale: 2 }).notNull(),
      amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
      applied_amount: numeric('applied_amount', { precision: 12, scale: 2 })
        .notNull()
        .default('0.00'),
      created_by_membership_id: bigint('created_by_membership_id', { mode: 'number' }),
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
      index('idx_supplier_credits_supplier_id').on(table.supplier_id),
      index('idx_supplier_credits_organization_created_by').on(
        table.organization_id,
        table.created_by_membership_id,
      ),
      uniqueIndex('idx_supplier_credits_public_id').on(table.public_id),
      index('idx_supplier_credits_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      // A supplier's open credits, oldest first — applied to their dues (MD11)
      index('idx_supplier_credits_supplier_open')
        .on(table.supplier_id, table.created_at, table.id)
        .where(sql`${table.applied_amount} < ${table.amount}`),
      index('idx_supplier_credits_medicine_id').on(table.medicine_id),
      index('idx_supplier_credits_medicine_batch_id').on(table.medicine_batch_id),
      index('idx_supplier_credits_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_supplier_credits_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_supplier_credits_quantity', sql`${table.quantity} > 0`),
      check('chk_supplier_credits_rate', sql`${table.rate} >= 0`),
      check(
        'chk_supplier_credits_amount',
        sql`${table.amount} = ${table.quantity} * ${table.rate}`,
      ),
      check(
        'chk_supplier_credits_applied_amount',
        sql`${table.applied_amount} >= 0 AND ${table.applied_amount} <= ${table.amount}`,
      ),
      check('chk_supplier_credits_updated', sql`${table.updated_at} >= ${table.created_at}`),
      foreignKey({
        name: 'supplier_credits_created_by_membership_fk',
        columns: [table.organization_id, table.created_by_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      pgPolicy('supplier_credits_tenant_isolation', {
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
