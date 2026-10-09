import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  pgPolicy,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema } from '@/infrastructure/database/pg-schemas.js';
import { sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import {
  TASK_AUTOMATIC_RULE_VALUES,
  TASK_RULE_VALUES,
} from '@/domains/app/sub-domains/tasks/tasks.constants.js';

/**
 * Drizzle table for `app.task_rule_settings` — one task rule's switches for the organization (launch
 * ROUTE #138, routes-final 10.B, TK10).
 *
 * @remarks
 * - **Notes:** one row per rule (`idx_task_rule_settings_organization_rule`); no row = on, by hand;
 *   "Let the app handle" (`is_automatic`) only on the rules with a step the server can take
 *   (`chk_task_rule_settings_automatic`). No soft delete — a save upserts. RLS on the organization
 *   GUC.
 */
export const task_rule_settings = appSchema
  .table(
    'task_rule_settings',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      rule_key: varchar('rule_key', { length: 17 }).notNull(),
      is_on: boolean('is_on').notNull().default(true),
      // "Let the app handle"
      is_automatic: boolean('is_automatic').notNull().default(false),
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
      uniqueIndex('idx_task_rule_settings_public_id').on(table.public_id),
      uniqueIndex('idx_task_rule_settings_organization_rule').on(
        table.organization_id,
        table.rule_key,
      ),
      index('idx_task_rule_settings_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_task_rule_settings_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check(
        'chk_task_rule_settings_rule_key',
        sql`${table.rule_key} IN (${sqlLiteralList(TASK_RULE_VALUES)})`,
      ),
      check(
        'chk_task_rule_settings_automatic',
        sql`NOT ${table.is_automatic} OR ${table.rule_key} IN (${sqlLiteralList(TASK_AUTOMATIC_RULE_VALUES)})`,
      ),
      check('chk_task_rule_settings_updated', sql`${table.updated_at} >= ${table.created_at}`),
      pgPolicy('task_rule_settings_tenant_isolation', {
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
