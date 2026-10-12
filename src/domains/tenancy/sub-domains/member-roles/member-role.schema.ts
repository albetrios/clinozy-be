import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  check,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { maintenanceBypassArm, tenancySchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import {
  CHIP_TONE_VALUES,
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import { ROLE_DEFAULT_TONE } from '@/domains/tenancy/sub-domains/member-roles/member-role.constants.js';

/**
 * `tenancy.roles` table — per-organization roles (both system and custom).
 * `is_system` marks built-in roles that must not be deleted; `deleted_at`
 * enables soft-delete — with why (`delete_reason`, a `delete_note` for `other`; launch T12) — and a
 * partial unique index keeps `name` unique within an organization only for live rows. RLS isolates rows to the
 * caller's organization.
 */
export const roles = tenancySchema
  .table(
    'roles',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      name: varchar('name', { length: 100 }).notNull(),
      description: text('description'),
      is_system: boolean('is_system').notNull().default(false),
      // Launch ROUTE #5 (D3): the role's chip colour, and whether its access is fixed (only Admin,
      // D40 — set when the roles are created, never through the API).
      tone: varchar('tone', { length: 10 }).notNull().default(ROLE_DEFAULT_TONE),
      is_locked: boolean('is_locked').notNull().default(false),
      deleted_at: timestamp('deleted_at', { withTimezone: true }),
      delete_reason: varchar('delete_reason', { length: 20 }),
      delete_note: varchar('delete_note', { length: 280 }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
        { onDelete: 'set null' },
      ),
      updated_by_user_id: bigint('updated_by_user_id', { mode: 'number' }).references(
        () => users.id,
        { onDelete: 'set null' },
      ),
    },
    (table) => [
      // Tombstone purge: only the soft-deleted rows, so live writes never maintain it.
      index('idx_roles_tombstoned')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      // Attribution FK indexes (partial on IS NOT NULL) from migration 20260623000000 — declared so
      // the schema lists every index the database has (pinned by index-hygiene.integration.test.ts).
      index('idx_roles_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_roles_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      uniqueIndex('idx_roles_public_id').on(table.public_id),
      index('idx_roles_org_name').on(table.organization_id, table.name),
      index('idx_roles_org_name_id_active')
        .on(table.organization_id, table.name, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_roles_org_system').on(table.organization_id, table.is_system),
      uniqueIndex('idx_roles_org_name_unique')
        .on(table.organization_id, table.name)
        .where(sql`${table.deleted_at} IS NULL`),
      check('chk_roles_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_roles_tone',
        sql`${table.tone} IN (${sql.join(
          CHIP_TONE_VALUES.map((tone) => sql`${tone}`),
          sql`, `,
        )})`,
      ),
      check(
        'chk_roles_delete_reason',
        sql`${table.delete_reason} IN (${sql.join(
          RECORD_DELETE_REASON_VALUES.map((reason) => sql`${reason}`),
          sql`, `,
        )})`,
      ),
      check(
        'chk_roles_delete_reason_when_deleted',
        sql`${table.delete_reason} IS NULL OR ${table.deleted_at} IS NOT NULL`,
      ),
      check(
        'chk_roles_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('roles_tenant_isolation', {
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
