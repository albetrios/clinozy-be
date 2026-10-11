import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  varchar,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  check,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { authSchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';

/**
 * `auth.user_notification_preferences` — per-user opt-in/opt-out per
 * `(notification_type, channel)` tuple, pinned to the user across every
 * organization context. Row-level security ties each row to the current user
 * (active, not soft-deleted), so the user-database context is required when
 * reading or writing. Channel values are constrained to `EMAIL`, `SMS`, `WEB_PUSH`,
 * `IN_APP` by check constraint.
 *
 * @remarks
 * Preferences are global to the user. Organization-scoped notification preferences live in
 * `tenancy.organization_notification_policies`, which is membership-gated.
 */
export const user_notification_preferences = authSchema
  .table(
    'user_notification_preferences',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      user_id: bigint('user_id', { mode: 'number' })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
      notification_type: varchar('notification_type', { length: 50 }).notNull(),
      channel: varchar('channel', { length: 20 }).notNull(),
      is_enabled: boolean('is_enabled').notNull().default(true),
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
      // Attribution FK indexes (partial on IS NOT NULL) from migration 20260623000000 — declared so
      // the schema lists every index the database has (pinned by index-hygiene.integration.test.ts).
      index('idx_user_notification_preferences_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_user_notification_preferences_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      // audit-#11: UNIQUE natural key so duplicate (user_id, type, channel) rows
      // cannot be persisted (a .limit(1) preference read must be deterministic).
      uniqueIndex('idx_user_notif_prefs_user_type_channel_unique').on(
        table.user_id,
        table.notification_type,
        table.channel,
      ),
      check(
        'chk_user_notif_prefs_channel',
        sql`${table.channel} IN ('EMAIL', 'SMS', 'WEB_PUSH', 'IN_APP')`,
      ),
      check('chk_user_notif_prefs_updated', sql`${table.updated_at} >= ${table.created_at}`),
      pgPolicy('user_notification_preferences_user_access', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.user_id} = (
            SELECT id FROM auth.users
            WHERE public_id = current_setting('app.current_user_public_id', true)
              AND deleted_at IS NULL
          )`,
        withCheck: sql`${table.user_id} = (
            SELECT id FROM auth.users
            WHERE public_id = current_setting('app.current_user_public_id', true)
              AND deleted_at IS NULL
          )`,
      }),
    ],
  )
  .enableRLS();
