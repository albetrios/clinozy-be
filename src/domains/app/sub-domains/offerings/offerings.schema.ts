import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  numeric,
  pgPolicy,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { offering_groups } from '@/domains/app/sub-domains/offering-groups/offering-groups.schema.js';
import { rooms } from '@/domains/app/sub-domains/rooms/rooms.schema.js';
import {
  CHIP_TONE_VALUES,
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  OFFERING_CATEGORY_VALUES,
  OFFERING_SPECIALTY_VALUES,
} from '@/domains/app/sub-domains/offerings/offerings.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.offerings` — A sellable service, package or product (launch ROUTE #11, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `offerings_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const offerings = appSchema
  .table(
    'offerings',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      // The "#274" of the offering list — per organization, never reused
      offering_number: integer('offering_number').notNull().default(0),
      name: varchar('name', { length: 120 }).notNull(),
      category: varchar('category', { length: 12 }).notNull().default('treatment'),
      specialty: varchar('specialty', { length: 7 }).notNull().default('skin'),
      tone: varchar('tone', { length: 10 }).notNull().default('sage'),
      price: numeric('price', { precision: 12, scale: 2 }).notNull(),
      min_price: numeric('min_price', { precision: 12, scale: 2 }).notNull().default('0.00'),
      duration_minutes: integer('duration_minutes').notNull().default(30),
      sessions: integer('sessions').notNull().default(1),
      // Packages: days a package stays usable; 0 = no expiry
      validity_days: integer('validity_days').notNull().default(0),
      default_doctor_membership_id: bigint('default_doctor_membership_id', {
        mode: 'number',
      }).references(() => memberships.id, { onDelete: 'set null' }),
      default_room_id: bigint('default_room_id', { mode: 'number' }).references(
        (): AnyPgColumn => rooms.id,
        { onDelete: 'set null' },
      ),
      gst_percent: integer('gst_percent').notNull().default(0),
      is_active: boolean('is_active').notNull().default(true),
      group_id: bigint('group_id', { mode: 'number' }).references(
        (): AnyPgColumn => offering_groups.id,
        { onDelete: 'set null' },
      ),
      offer_price: numeric('offer_price', { precision: 12, scale: 2 }),
      is_gst_inclusive: boolean('is_gst_inclusive').notNull().default(false),
      search_terms: text('search_terms').array().notNull().default([]),
      description: text('description'),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
      updated_by_user_id: bigint('updated_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
      deleted_at: timestamp('deleted_at', { withTimezone: true }),
      delete_reason: varchar('delete_reason', { length: 20 }),
      delete_note: varchar('delete_note', { length: 280 }),
    },
    (table) => [
      uniqueIndex('idx_offerings_public_id').on(table.public_id),
      index('idx_offerings_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_offerings_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_offerings_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_offerings_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_offerings_organization_name')
        .on(table.organization_id, table.name, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_offerings_default_doctor_membership_id')
        .on(table.default_doctor_membership_id)
        .where(sql`${table.default_doctor_membership_id} IS NOT NULL`),
      index('idx_offerings_default_room_id')
        .on(table.default_room_id)
        .where(sql`${table.default_room_id} IS NOT NULL`),
      index('idx_offerings_group_id').on(table.group_id).where(sql`${table.group_id} IS NOT NULL`),
      uniqueIndex('idx_offerings_organization_offering_number').on(
        table.organization_id,
        table.offering_number,
      ),
      uniqueIndex('idx_offerings_organization_name_unique')
        .on(table.organization_id, sql`lower(${table.name})`)
        .where(sql`${table.deleted_at} IS NULL`),
      check('chk_offerings_offering_number', sql`${table.offering_number} > 0`),
      check(
        'chk_offerings_category',
        sql`${table.category} IN (${joinValues(OFFERING_CATEGORY_VALUES)})`,
      ),
      check(
        'chk_offerings_specialty',
        sql`${table.specialty} IN (${joinValues(OFFERING_SPECIALTY_VALUES)})`,
      ),
      check('chk_offerings_tone', sql`${table.tone} IN (${joinValues(CHIP_TONE_VALUES)})`),
      check('chk_offerings_price', sql`${table.price} >= 0`),
      check('chk_offerings_min_price', sql`${table.min_price} >= 0`),
      check('chk_offerings_duration_minutes', sql`${table.duration_minutes} BETWEEN 5 AND 480`),
      check('chk_offerings_sessions', sql`${table.sessions} BETWEEN 1 AND 99`),
      check('chk_offerings_validity_days', sql`${table.validity_days} BETWEEN 0 AND 1095`),
      check('chk_offerings_gst_percent', sql`${table.gst_percent} IN (0, 5, 12, 18, 28)`),
      check('chk_offerings_offer_price', sql`${table.offer_price} >= 0`),
      check('chk_offerings_min_price_within_price', sql`${table.min_price} <= ${table.price}`),
      check(
        'chk_offerings_offer_price_within_price',
        sql`${table.offer_price} IS NULL OR ${table.offer_price} <= ${table.price}`,
      ),
      check('chk_offerings_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_offerings_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_offerings_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_offerings_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('offerings_tenant_isolation', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.organization_id} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR ${maintenanceBypassArm('app.global_retention_cleanup')}`,
        withCheck: sql`${table.organization_id} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`,
      }),
    ],
  )
  .enableRLS();

/**
 * Drizzle link table `app.offering_branches` — the `branch_ids` of an offering (launch ROUTE #11).
 * One row per pair; removing either side removes the row. RLS on the organization GUC.
 */
export const offering_branches = appSchema
  .table(
    'offering_branches',
    {
      offering_id: bigint('offering_id', { mode: 'number' })
        .notNull()
        .references(() => offerings.id, { onDelete: 'cascade' }),
      branch_id: bigint('branch_id', { mode: 'number' })
        .notNull()
        .references(() => branches.id, { onDelete: 'cascade' }),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      primaryKey({ name: 'offering_branches_pkey', columns: [table.offering_id, table.branch_id] }),
      index('idx_offering_branches_branch_id').on(table.branch_id),
      index('idx_offering_branches_organization_id').on(table.organization_id),
      index('idx_offering_branches_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      pgPolicy('offering_branches_tenant_isolation', {
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
