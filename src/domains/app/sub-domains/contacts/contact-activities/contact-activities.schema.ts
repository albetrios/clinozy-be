import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
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
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { contact_message_templates } from '@/domains/app/sub-domains/contacts/contact-message-templates/contact-message-templates.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { invoices } from '@/domains/app/sub-domains/invoices/invoices.schema.js';
import { payments } from '@/domains/app/sub-domains/payments/payments.schema.js';
import { patient_prescriptions } from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.schema.js';
import { patient_offerings } from '@/domains/app/sub-domains/patients/patient-offerings/patient-offerings.schema.js';
import { patient_reviews } from '@/domains/app/sub-domains/patients/patient-reviews/patient-reviews.schema.js';
import { patient_check_ins } from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.schema.js';
import { tasks } from '@/domains/app/sub-domains/tasks/tasks.schema.js';
import { patient_treatments } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.schema.js';
import { patient_clinical_notes } from '@/domains/app/sub-domains/patients/patient-clinical-notes/patient-clinical-notes.schema.js';
import { patient_images } from '@/domains/app/sub-domains/patients/patient-images/patient-images.schema.js';
import { patient_reports } from '@/domains/app/sub-domains/patients/patient-reports/patient-reports.schema.js';
import {
  CONTACT_ACTIVITY_ATTACHMENTS_MAX,
  CONTACT_ACTIVITY_DELIVERY_STATUS_VALUES,
  CONTACT_ACTIVITY_DIRECTION_VALUES,
  CONTACT_ACTIVITY_LINK_COLUMNS,
  CONTACT_ACTIVITY_MESSAGE_TYPE_VALUES,
  CONTACT_ACTIVITY_TYPE,
  CONTACT_ACTIVITY_TYPE_VALUES,
} from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.contact_activities` — one entry of a contact's stream: a WhatsApp or
 * Instagram message, a call log, an internal note or a server event (launch ROUTE #130,
 * routes-final 4.C; was `app.messages`, M1).
 *
 * @remarks
 * - **Notes:** append-only (M7) — no soft-delete columns; the stream goes with its contact
 *   (`ON DELETE CASCADE`). The CHECKs hold M2 (direction only on messages and calls; a delivery
 *   status exactly on a sent message; no author on a system or received entry) and M5 (at most one
 *   of the twelve record links — each pointing at today's table, D63). The author is a composite
 *   key into the organization's memberships, kept when they leave (K2, K8). RLS is the
 *   organization policy; not branch-scoped (CT6).
 */
export const contact_activities = appSchema
  .table(
    'contact_activities',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      contact_id: bigint('contact_id', { mode: 'number' })
        .notNull()
        .references(() => contacts.id, { onDelete: 'cascade' }),
      type: varchar('type', { length: 9 }).notNull(),
      direction: varchar('direction', { length: 8 }),
      body: varchar('body', { length: 1000 }).notNull(),
      contact_message_template_id: bigint('contact_message_template_id', {
        mode: 'number',
      }).references(() => contact_message_templates.id, { onDelete: 'set null' }),
      attachment_keys: text('attachment_keys').array().notNull().default([]),
      // The entry this one answers — in the same stream (M6)
      reply_to_contact_activity_id: bigint('reply_to_contact_activity_id', {
        mode: 'number',
      }).references((): AnyPgColumn => contact_activities.id, { onDelete: 'set null' }),
      delivery_status: varchar('delivery_status', { length: 9 }),
      // The provider's id (WhatsApp wamid) — matches delivery reports, once per organization (M8)
      provider_message_id: varchar('provider_message_id', { length: 128 }),
      failure_reason: varchar('failure_reason', { length: 280 }),
      occurred_at: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
      delivered_at: timestamp('delivered_at', { withTimezone: true }),
      read_at: timestamp('read_at', { withTimezone: true }),
      failed_at: timestamp('failed_at', { withTimezone: true }),
      author_membership_id: bigint('author_membership_id', { mode: 'number' }),
      appointment_id: bigint('appointment_id', { mode: 'number' }).references(
        (): AnyPgColumn => appointments.id,
        {
          onDelete: 'set null',
        },
      ),
      invoice_id: bigint('invoice_id', { mode: 'number' }).references(
        (): AnyPgColumn => invoices.id,
        {
          onDelete: 'set null',
        },
      ),
      payment_id: bigint('payment_id', { mode: 'number' }).references(
        (): AnyPgColumn => payments.id,
        {
          onDelete: 'set null',
        },
      ),
      patient_prescription_id: bigint('patient_prescription_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_prescriptions.id,
        {
          onDelete: 'set null',
        },
      ),
      patient_offering_id: bigint('patient_offering_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_offerings.id,
        {
          onDelete: 'set null',
        },
      ),
      patient_review_id: bigint('patient_review_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_reviews.id,
        {
          onDelete: 'set null',
        },
      ),
      patient_check_in_id: bigint('patient_check_in_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_check_ins.id,
        {
          onDelete: 'set null',
        },
      ),
      task_id: bigint('task_id', { mode: 'number' }).references((): AnyPgColumn => tasks.id, {
        onDelete: 'set null',
      }),
      patient_treatment_id: bigint('patient_treatment_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_treatments.id,
        {
          onDelete: 'set null',
        },
      ),
      patient_clinical_note_id: bigint('patient_clinical_note_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_clinical_notes.id,
        {
          onDelete: 'set null',
        },
      ),
      patient_image_id: bigint('patient_image_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_images.id,
        {
          onDelete: 'set null',
        },
      ),
      patient_report_id: bigint('patient_report_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_reports.id,
        {
          onDelete: 'set null',
        },
      ),
      // An entry about a private-album photo (P23, M10) — shown only to the album's holders
      is_private_photo: boolean('is_private_photo').notNull().default(false),
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
      uniqueIndex('idx_contact_activities_public_id').on(table.public_id),
      // The stream, oldest first — and the newest page by a backward scan
      index('idx_contact_activities_contact_id_occurred_at').on(
        table.contact_id,
        table.occurred_at,
        table.id,
      ),
      index('idx_contact_activities_contact_id_created_at').on(
        table.contact_id,
        table.created_at,
        table.id,
      ),
      uniqueIndex('idx_contact_activities_organization_provider_message_id')
        .on(table.organization_id, table.provider_message_id)
        .where(sql`${table.provider_message_id} IS NOT NULL`),
      // The messaging worker's queue (M8)
      index('idx_contact_activities_organization_delivery_queue')
        .on(table.organization_id, table.occurred_at)
        .where(sql`${table.delivery_status} IN ('queued', 'failed')`),
      index('idx_contact_activities_contact_message_template_id')
        .on(table.contact_message_template_id)
        .where(sql`${table.contact_message_template_id} IS NOT NULL`),
      index('idx_contact_activities_reply_to_contact_activity_id')
        .on(table.reply_to_contact_activity_id)
        .where(sql`${table.reply_to_contact_activity_id} IS NOT NULL`),
      index('idx_contact_activities_organization_id_author_membership_id')
        .on(table.organization_id, table.author_membership_id)
        .where(sql`${table.author_membership_id} IS NOT NULL`),
      // One per record link (M5) — the stream entries about a record
      ...CONTACT_ACTIVITY_LINK_COLUMNS.map((column) =>
        index(`idx_contact_activities_${column}`)
          .on(table[column])
          .where(sql`${table[column]} IS NOT NULL`),
      ),
      index('idx_contact_activities_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_contact_activities_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      foreignKey({
        name: 'contact_activities_author_membership_fk',
        columns: [table.organization_id, table.author_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      check(
        'chk_contact_activities_type',
        sql`${table.type} IN (${joinValues(CONTACT_ACTIVITY_TYPE_VALUES)})`,
      ),
      check(
        'chk_contact_activities_direction',
        sql`${table.direction} IN (${joinValues(CONTACT_ACTIVITY_DIRECTION_VALUES)})`,
      ),
      check(
        'chk_contact_activities_direction_by_type',
        sql`(${table.type} IN (${CONTACT_ACTIVITY_TYPE.NOTE}, ${CONTACT_ACTIVITY_TYPE.SYSTEM})) = (${table.direction} IS NULL)`,
      ),
      check('chk_contact_activities_body', sql`char_length(btrim(${table.body})) >= 1`),
      check(
        'chk_contact_activities_attachment_keys',
        sql`cardinality(${table.attachment_keys}) <= ${sql.raw(String(CONTACT_ACTIVITY_ATTACHMENTS_MAX))}`,
      ),
      check(
        'chk_contact_activities_delivery_status',
        sql`${table.delivery_status} IN (${joinValues(CONTACT_ACTIVITY_DELIVERY_STATUS_VALUES)})`,
      ),
      check(
        'chk_contact_activities_delivery_status_on_sent_messages',
        sql`(${table.delivery_status} IS NOT NULL) = (${table.type} IN (${joinValues(CONTACT_ACTIVITY_MESSAGE_TYPE_VALUES)}) AND ${table.direction} IS NOT DISTINCT FROM 'sent')`,
      ),
      check(
        'chk_contact_activities_failure_when_failed',
        sql`${table.delivery_status} IS DISTINCT FROM 'failed' OR ${table.failure_reason} IS NOT NULL`,
      ),
      check(
        'chk_contact_activities_author',
        sql`${table.author_membership_id} IS NULL OR (${table.type} <> ${CONTACT_ACTIVITY_TYPE.SYSTEM} AND ${table.direction} IS DISTINCT FROM 'received')`,
      ),
      check(
        'chk_contact_activities_one_link',
        sql`num_nonnulls(${sql.join(
          CONTACT_ACTIVITY_LINK_COLUMNS.map((column) => sql`${table[column]}`),
          sql`, `,
        )}) <= 1`,
      ),
      check('chk_contact_activities_updated', sql`${table.updated_at} >= ${table.created_at}`),
      pgPolicy('contact_activities_tenant_isolation', {
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
