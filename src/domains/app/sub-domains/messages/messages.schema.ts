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
import { medical_contacts } from '@/domains/app/sub-domains/medical-contacts/medical-contacts.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { message_templates } from '@/domains/app/sub-domains/message-templates/message-templates.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { tasks } from '@/domains/app/sub-domains/tasks/tasks.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  MESSAGE_CHANNEL_VALUES,
  MESSAGE_DIRECTION_VALUES,
  MESSAGE_KIND_VALUES,
  MESSAGE_DELIVERY_STATUS_VALUES,
  MESSAGE_RECORD_TYPE_VALUES,
} from '@/domains/app/sub-domains/messages/messages.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.messages` — One line of a contact's conversation — a patient, a lead or a walk-in buyer; WhatsApp, Instagram, SMS, email, a call or a note (launch ROUTE #15, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `messages_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const messages = appSchema
  .table(
    'messages',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      // The contact, when a lead
      lead_id: bigint('lead_id', { mode: 'number' }).references((): AnyPgColumn => leads.id, {
        onDelete: 'cascade',
      }),
      // The contact, when a patient
      patient_id: bigint('patient_id', { mode: 'number' }).references(
        (): AnyPgColumn => patients.id,
        { onDelete: 'cascade' },
      ),
      // The contact, when a walk-in buyer
      medical_contact_id: bigint('medical_contact_id', { mode: 'number' }).references(
        (): AnyPgColumn => medical_contacts.id,
        { onDelete: 'cascade' },
      ),
      channel: varchar('channel', { length: 9 }).notNull().default('whatsapp'),
      direction: varchar('direction', { length: 8 }).notNull().default('sent'),
      kind: varchar('kind', { length: 8 }).notNull().default('text'),
      body: text('body').notNull(),
      // The template the line was written from
      message_template_id: bigint('message_template_id', { mode: 'number' }).references(
        (): AnyPgColumn => message_templates.id,
        { onDelete: 'set null' },
      ),
      // Uploaded files sent with the line
      attachment_keys: text('attachment_keys').array().notNull().default([]),
      // The line this one answers
      reply_to_message_id: bigint('reply_to_message_id', { mode: 'number' }).references(
        (): AnyPgColumn => messages.id,
        { onDelete: 'set null' },
      ),
      delivery_status: varchar('delivery_status', { length: 9 }).notNull().default('queued'),
      // The provider's id (WhatsApp wamid) — matches delivery reports
      provider_message_id: varchar('provider_message_id', { length: 128 }),
      failure_reason: varchar('failure_reason', { length: 280 }),
      sent_at: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
      delivered_at: timestamp('delivered_at', { withTimezone: true }),
      read_at: timestamp('read_at', { withTimezone: true }),
      failed_at: timestamp('failed_at', { withTimezone: true }),
      // Written by Clinozy (a reminder, a receipt)
      is_system: boolean('is_system').notNull().default(false),
      author_membership_id: bigint('author_membership_id', { mode: 'number' }).references(
        () => memberships.id,
        { onDelete: 'set null' },
      ),
      // What the line points at
      record_type: varchar('record_type', { length: 15 }),
      // That record's public id
      record_id: varchar('record_id', { length: 28 }),
      // The task the line answers
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
      uniqueIndex('idx_messages_public_id').on(table.public_id),
      index('idx_messages_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_messages_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_messages_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_messages_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_messages_lead_sent')
        .on(table.lead_id, table.sent_at)
        .where(sql`${table.lead_id} IS NOT NULL`),
      index('idx_messages_patient_sent')
        .on(table.patient_id, table.sent_at)
        .where(sql`${table.patient_id} IS NOT NULL`),
      index('idx_messages_medical_contact_sent')
        .on(table.medical_contact_id, table.sent_at)
        .where(sql`${table.medical_contact_id} IS NOT NULL`),
      index('idx_messages_message_template_id')
        .on(table.message_template_id)
        .where(sql`${table.message_template_id} IS NOT NULL`),
      index('idx_messages_reply_to_message_id')
        .on(table.reply_to_message_id)
        .where(sql`${table.reply_to_message_id} IS NOT NULL`),
      index('idx_messages_organization_sent_at')
        .on(table.organization_id, table.sent_at, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_messages_author_membership_id')
        .on(table.author_membership_id)
        .where(sql`${table.author_membership_id} IS NOT NULL`),
      index('idx_messages_task_id').on(table.task_id).where(sql`${table.task_id} IS NOT NULL`),
      check(
        'chk_messages_channel',
        sql`${table.channel} IN (${joinValues(MESSAGE_CHANNEL_VALUES)})`,
      ),
      check(
        'chk_messages_direction',
        sql`${table.direction} IN (${joinValues(MESSAGE_DIRECTION_VALUES)})`,
      ),
      check('chk_messages_kind', sql`${table.kind} IN (${joinValues(MESSAGE_KIND_VALUES)})`),
      check(
        'chk_messages_delivery_status',
        sql`${table.delivery_status} IN (${joinValues(MESSAGE_DELIVERY_STATUS_VALUES)})`,
      ),
      check(
        'chk_messages_record_type',
        sql`${table.record_type} IN (${joinValues(MESSAGE_RECORD_TYPE_VALUES)})`,
      ),
      check(
        'chk_messages_one_contact',
        sql`((${table.lead_id} IS NOT NULL)::int + (${table.patient_id} IS NOT NULL)::int + (${table.medical_contact_id} IS NOT NULL)::int) = 1`,
      ),
      check(
        'chk_messages_record_with_type',
        sql`(${table.record_type} IS NULL) = (${table.record_id} IS NULL)`,
      ),
      check(
        'chk_messages_failure_when_failed',
        sql`${table.delivery_status} <> 'failed' OR ${table.failure_reason} IS NOT NULL`,
      ),
      check('chk_messages_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_messages_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_messages_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_messages_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('messages_tenant_isolation', {
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
