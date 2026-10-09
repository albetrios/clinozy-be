import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  index,
  pgPolicy,
  smallint,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema } from '@/infrastructure/database/pg-schemas.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { PATIENT_IDEAS_MAX, PATIENT_IDEA_REASON_MAX } from './patient-ideas.constants.js';

/**
 * Drizzle table for `app.patient_ideas` — a patient's AI offering ideas (launch ROUTE #152,
 * routes-final 7.N, D80): at most {@link PATIENT_IDEAS_MAX} per patient, in order, each with the
 * reason Claude gave.
 *
 * @remarks
 * - **Notes:** a derived cache, replaced as a whole by each refresh (the `patient-ideas` worker) —
 *   no soft delete, no routes of its own, outside the record purge; the patient and the offering
 *   `ON DELETE CASCADE`. RLS on the organization GUC. The `ideas_stale_since` mark on
 *   `app.patients` and the triggers that set it live in the baseline migration.
 */
export const patient_ideas = appSchema
  .table(
    'patient_ideas',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      patient_id: bigint('patient_id', { mode: 'number' })
        .notNull()
        .references(() => patients.id, { onDelete: 'cascade' }),
      offering_id: bigint('offering_id', { mode: 'number' })
        .notNull()
        .references(() => offerings.id, { onDelete: 'cascade' }),
      position: smallint('position').notNull(),
      reason: varchar('reason', { length: PATIENT_IDEA_REASON_MAX }).notNull(),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      uniqueIndex('idx_patient_ideas_patient_offering').on(table.patient_id, table.offering_id),
      index('idx_patient_ideas_organization_id').on(table.organization_id),
      index('idx_patient_ideas_offering_id').on(table.offering_id),
      check(
        'chk_patient_ideas_position',
        sql`${table.position} BETWEEN 1 AND ${sql.raw(String(PATIENT_IDEAS_MAX))}`,
      ),
      check('chk_patient_ideas_reason', sql`char_length(${table.reason}) > 0`),
      pgPolicy('patient_ideas_tenant_isolation', {
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
