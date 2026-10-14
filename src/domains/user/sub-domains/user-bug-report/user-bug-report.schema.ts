import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  index,
  pgPolicy,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { authSchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';

/**
 * `auth.user_bug_reports` — one row per bug report a signed-in person files (feat-bug-report BR3):
 * what they wrote (typed or dictated), where they were, which release they ran, and who they are —
 * `user_id`, `reporter_name` and `reporter_email` are stamped from the verified session's account,
 * never from the request body (BR4). `organization_public_id` is a snapshot of the token's `org`
 * claim (no foreign key — a deleted workspace leaves the report). Append-only through the API.
 * Cascades on user delete, so an account purge takes its reports (BR10). RLS-gated by
 * `app.current_user_public_id` with no bypass arm: nobody reads another person's reports through
 * the app role (BR8).
 */
export const user_bug_reports = authSchema
  .table(
    'user_bug_reports',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull().unique(),
      user_id: bigint('user_id', { mode: 'number' })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
      reporter_name: varchar('reporter_name', { length: 201 }),
      reporter_email: varchar('reporter_email', { length: 255 }).notNull(),
      organization_public_id: varchar('organization_public_id', { length: 28 }),
      description: text('description').notNull(),
      input_method: varchar('input_method', { length: 10 }).notNull(),
      page_path: varchar('page_path', { length: 2048 }),
      app_version: varchar('app_version', { length: 64 }),
      user_agent: varchar('user_agent', { length: 512 }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      index('idx_user_bug_reports_user_id').on(table.user_id),
      check(
        'chk_user_bug_reports_description',
        sql`char_length(btrim(${table.description})) BETWEEN 1 AND 5000`,
      ),
      check(
        'chk_user_bug_reports_input_method',
        sql`${table.input_method} IN ('typed', 'voice', 'mixed')`,
      ),
      pgPolicy('user_bug_reports_owner_access', {
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
