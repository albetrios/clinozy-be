import { sql } from 'drizzle-orm';
import { bigint, check, integer, pgPolicy, primaryKey, varchar } from 'drizzle-orm/pg-core';
import { appSchema } from '@/infrastructure/database/pg-schemas.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';

/**
 * Drizzle table for `app.record_counters` — the last running number handed out per organization
 * and counter (`patients.patient_number`, `invoices:<branch_id>:<financial year>`).
 * Numbers only grow, so a purged record never gives its number back (schema review H7). Written
 * only by the `app.fn_assign_record_number` and `app.fn_assign_invoice_number` triggers. RLS on
 * the organization GUC.
 */
export const record_counters = appSchema
  .table(
    'record_counters',
    {
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      counter_key: varchar('counter_key', { length: 80 }).notNull(),
      last_value: integer('last_value').notNull().default(0),
    },
    (table) => [
      primaryKey({
        name: 'record_counters_pkey',
        columns: [table.organization_id, table.counter_key],
      }),
      check('chk_record_counters_last_value', sql`${table.last_value} >= 0`),
      pgPolicy('record_counters_tenant_isolation', {
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
