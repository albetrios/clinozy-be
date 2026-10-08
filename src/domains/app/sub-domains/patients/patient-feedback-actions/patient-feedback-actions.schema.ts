import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  foreignKey,
  index,
  pgPolicy,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { patient_check_ins } from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.schema.js';
import { patient_reviews } from '@/domains/app/sub-domains/patients/patient-reviews/patient-reviews.schema.js';
import {
  PATIENT_FEEDBACK_ACTION,
  PATIENT_FEEDBACK_ACTION_VALUES,
} from '@/domains/app/sub-domains/patients/patient-feedback-actions/patient-feedback-actions.constants.js';

/** `'a', 'b', …` — a value list as SQL literals, for an `IN (…)` or `ARRAY[…]` CHECK. */
function literalList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

/**
 * Drizzle table for `app.patient_feedback_actions` — what was done about one check-in or one
 * review (launch ROUTE #134, routes-final 7.K).
 *
 * @remarks
 * - **Notes:** append-only — no `updated_*` or soft-delete columns, never changed (TR12); it goes
 *   with its check-in or review (`ON DELETE CASCADE`), exactly one of them
 *   (`chk_patient_feedback_actions_one_parent`); the author a K8 composite key `RESTRICT` (K2). The
 *   first action turns its parent's `needs_action` off. RLS on the organization GUC.
 */
export const patient_feedback_actions = appSchema
  .table(
    'patient_feedback_actions',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      patient_check_in_id: bigint('patient_check_in_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_check_ins.id,
        { onDelete: 'cascade' },
      ),
      patient_review_id: bigint('patient_review_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_reviews.id,
        { onDelete: 'cascade' },
      ),
      action: varchar('action', { length: 18 }).notNull(),
      note: varchar('note', { length: 280 }),
      // The caller (the design's "by")
      author_membership_id: bigint('author_membership_id', { mode: 'number' }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      index('idx_patient_feedback_actions_organization_id').on(table.organization_id),
      uniqueIndex('idx_patient_feedback_actions_public_id').on(table.public_id),
      index('idx_patient_feedback_actions_patient_check_in')
        .on(table.patient_check_in_id, table.created_at)
        .where(sql`${table.patient_check_in_id} IS NOT NULL`),
      index('idx_patient_feedback_actions_patient_review')
        .on(table.patient_review_id, table.created_at)
        .where(sql`${table.patient_review_id} IS NOT NULL`),
      index('idx_patient_feedback_actions_author_membership_id')
        .on(table.organization_id, table.author_membership_id)
        .where(sql`${table.author_membership_id} IS NOT NULL`),
      index('idx_patient_feedback_actions_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      // K8: a member of this organization, kept when they leave (K2)
      foreignKey({
        name: 'patient_feedback_actions_author_membership_fk',
        columns: [table.organization_id, table.author_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      check(
        'chk_patient_feedback_actions_one_parent',
        sql`num_nonnulls(${table.patient_check_in_id}, ${table.patient_review_id}) = 1`,
      ),
      check(
        'chk_patient_feedback_actions_action',
        sql`${table.action} IN (${literalList(PATIENT_FEEDBACK_ACTION_VALUES)})`,
      ),
      check(
        'chk_patient_feedback_actions_note_when_other',
        sql`${table.action} <> '${sql.raw(PATIENT_FEEDBACK_ACTION.OTHER)}' OR ${table.note} IS NOT NULL`,
      ),
      pgPolicy('patient_feedback_actions_tenant_isolation', {
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
