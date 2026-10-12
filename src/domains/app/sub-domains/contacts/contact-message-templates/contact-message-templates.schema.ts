import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  index,
  pgPolicy,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import { CONTACT_MESSAGE_TEMPLATE_TYPE_VALUES } from '@/domains/app/sub-domains/contacts/contact-message-templates/contact-message-templates.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.contact_message_templates` — reusable texts for outgoing WhatsApp and
 * Instagram messages; `<first>` and `<interest>` are filled for each contact (launch ROUTE #130,
 * routes-final 4.D; was `app.message_templates`, M11).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `contact_message_templates_tenant_isolation` policy on the organization GUC, with the
 * retention-cleanup arm for the deleted-record purge.
 */
export const contact_message_templates = appSchema
  .table(
    'contact_message_templates',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      name: varchar('name', { length: 60 }).notNull(),
      body: varchar('body', { length: 1000 }).notNull(),
      type: varchar('type', { length: 9 }).notNull().default('whatsapp'),
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
      uniqueIndex('idx_contact_message_templates_public_id').on(table.public_id),
      // The default list order — newest first among live templates
      index('idx_contact_message_templates_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_contact_message_templates_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_contact_message_templates_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_contact_message_templates_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_contact_message_templates_organization_name')
        .on(table.organization_id, table.name, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      uniqueIndex('idx_contact_message_templates_organization_name_unique')
        .on(table.organization_id, sql`lower(${table.name})`)
        .where(sql`${table.deleted_at} IS NULL`),
      check('chk_contact_message_templates_name', sql`char_length(btrim(${table.name})) > 0`),
      check('chk_contact_message_templates_body', sql`char_length(btrim(${table.body})) > 0`),
      check(
        'chk_contact_message_templates_type',
        sql`${table.type} IN (${joinValues(CONTACT_MESSAGE_TEMPLATE_TYPE_VALUES)})`,
      ),
      check(
        'chk_contact_message_templates_updated',
        sql`${table.updated_at} >= ${table.created_at}`,
      ),
      check(
        'chk_contact_message_templates_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_contact_message_templates_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_contact_message_templates_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('contact_message_templates_tenant_isolation', {
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
