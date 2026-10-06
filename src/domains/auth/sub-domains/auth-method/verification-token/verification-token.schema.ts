import { bigint, bigserial, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { authSchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';

/**
 * Drizzle table for `auth.verification_tokens` — unified store for email-code /
 * password-reset / email-verification / email-change tokens. `token_hash` is
 * unique and indexed for replay-safe lookups; FORCE RLS is role-gated — deny-all
 * for every role except the two runtime roles (`clinozy_be_app`,
 * `clinozy_be_maintenance`), which get full access. See sec-D9 notes below.
 *
 * @remarks
 * **sec-D9 — application-trust safety model (read this before touching the
 * policy).** The policies gate by ROLE, not by row: a runtime-role connection
 * reads every row. Within those roles the safety model is NOT enforced by
 * RLS — it is enforced by three application-level invariants:
 *
 *   1. The `token_hash` column stores the SHA-256 of a 32-byte CSPRNG random
 *      token. The hash is the secret; possession of it is authorization. An
 *      unconstrained read is harmless unless an attacker reaches the row by
 *      another path (raw SQL access via a compromised role).
 *   2. The application ALWAYS looks up by `token_hash`, never by `user_id` or
 *      `email`. `VerificationTokenRepository.consumeIfValid` is the single
 *      read+UPDATE entry point; there is no scoped-list endpoint.
 *   3. No untrusted SQL execution path exists. Every code path under
 *      `getRequestDatabase()` runs prepared statements through Drizzle.
 *
 * A future operational tool that browses for "all pending email codes" would
 * break invariant #2 and leak `token_hash` + `user_id` + `email`. If such a
 * tool is added, replace the policy with a narrower predicate (e.g.
 * `USING (token_hash = current_setting('app.current_verification_token_hash', true))`
 * set by the consume path) or convert the read to a SECURITY DEFINER resolver.
 * The audit recommendation is to do the latter; we defer that work until the
 * first operational tool actually needs it, because a narrower policy without
 * a corresponding consumer is dead code.
 */
export const verification_tokens = authSchema
  .table(
    'verification_tokens',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      token_type: varchar('token_type', { length: 30 }).notNull(),
      token_hash: varchar('token_hash', { length: 64 }).notNull().unique(),
      user_id: bigint('user_id', { mode: 'number' })
        .notNull()
        .references(() => users.id),
      email: varchar('email', { length: 255 }).notNull(),
      expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
      used_at: timestamp('used_at', { withTimezone: true }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      // sec-D #32: `token_hash` is already UNIQUE on the column (`.unique()` above
      // provisions a unique btree). The prior non-unique
      // `idx_verification_tokens_token_hash` was a redundant duplicate index
      // dropped by 20260607040000.
      index('idx_verification_tokens_user_type').on(table.user_id, table.token_type),
      // sec-D #11: covers the sec-D5 retention sweep
      // (`DELETE WHERE expires_at < cutoff`). Added by 20260607010000.
      index('idx_verification_tokens_expires_at').on(table.expires_at),
      // Role-gated like the other system tables, so the policies live only in migrations:
      // `verification_tokens_deny_all` (TO PUBLIC, USING false) plus
      // `verification_tokens_app_access` (TO clinozy_be_app, clinozy_be_maintenance) —
      // 20260923120000 and 20261006022303. The permissive TO public policy this file used to
      // declare was dropped by 20260923120000.
    ],
  )
  .enableRLS();
