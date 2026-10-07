import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  index,
  pgPolicy,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { tasks } from '@/domains/app/sub-domains/tasks/tasks.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  LEAD_MESSAGE_CHANNEL_VALUES,
  LEAD_MESSAGE_DIRECTION_VALUES,
  LEAD_MESSAGE_DELIVERY_STATUS_VALUES,
} from '@/domains/app/sub-domains/lead-messages/lead-messages.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.lead_messages` — One line of a lead's conversation (launch ROUTE #15, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `lead_messages_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const lead_messages = appSchema
  .table(
    'lead_messages',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      lead_id: bigint('lead_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => leads.id, { onDelete: 'cascade' }),
      channel: varchar('channel', { length: 9 }).notNull().default('whatsapp'),
      direction: varchar('direction', { length: 8 }).notNull().default('sent'),
      body: text('body').notNull(),
      delivery_status: varchar('delivery_status', { length: 9 }).notNull().default('queued'),
      is_system: boolean('is_system').notNull().default(false),
      author_membership_id: bigint('author_membership_id', { mode: 'number' }).references(
        () => memberships.id,
        { onDelete: 'set null' },
      ),
      sent_at: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
      // What the line points at (an appointment, an invoice…)
      record_type: varchar('record_type', { length: 30 }),
      // That record's public id
      record_id: varchar('record_id', { length: 28 }),
      task_id: bigint('task_id', { mode: 'number' }).references((): AnyPgColumn => tasks.id, {
        onDelete: 'set null',
      }),
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
      uniqueIndex('idx_lead_messages_public_id').on(table.public_id),
      index('idx_lead_messages_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_lead_messages_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_lead_messages_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_lead_messages_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_lead_messages_lead_created').on(table.lead_id, table.created_at, table.id),
      index('idx_lead_messages_author_membership_id')
        .on(table.author_membership_id)
        .where(sql`${table.author_membership_id} IS NOT NULL`),
      index('idx_lead_messages_organization_sent_at')
        .on(table.organization_id, table.sent_at, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_lead_messages_task_id').on(table.task_id).where(sql`${table.task_id} IS NOT NULL`),
      check(
        'chk_lead_messages_channel',
        sql`${table.channel} IN (${joinValues(LEAD_MESSAGE_CHANNEL_VALUES)})`,
      ),
      check(
        'chk_lead_messages_direction',
        sql`${table.direction} IN (${joinValues(LEAD_MESSAGE_DIRECTION_VALUES)})`,
      ),
      check(
        'chk_lead_messages_delivery_status',
        sql`${table.delivery_status} IN (${joinValues(LEAD_MESSAGE_DELIVERY_STATUS_VALUES)})`,
      ),
      check('chk_lead_messages_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_lead_messages_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_lead_messages_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_lead_messages_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('lead_messages_tenant_isolation', {
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
