import { sql } from 'drizzle-orm';
import { bigint, index, pgPolicy, primaryKey, timestamp } from 'drizzle-orm/pg-core';
import { appSchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';

/**
 * Drizzle table for `app.branch_user_accesses` — which branches each person of an organization
 * works in (launch ROUTE #2, D9). One row per (branch, membership): a membership is the user in
 * this organization, so leaving the organization removes the access (`CASCADE`). Read by
 * `GET /app/branches/my`; written by `PUT /app/branches/{branch_id}/user-accesses` and, later, the
 * staff invite and edit. RLS is the `branch_user_accesses_tenant_isolation` policy on the
 * organization GUC.
 */
export const branch_user_accesses = appSchema
  .table(
    'branch_user_accesses',
    {
      branch_id: bigint('branch_id', { mode: 'number' })
        .notNull()
        .references(() => branches.id, { onDelete: 'cascade' }),
      membership_id: bigint('membership_id', { mode: 'number' })
        .notNull()
        .references(() => memberships.id, { onDelete: 'cascade' }),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      primaryKey({
        name: 'branch_user_accesses_pkey',
        columns: [table.branch_id, table.membership_id],
      }),
      // `/my` reads by membership; the membership delete cascade needs it too.
      index('idx_branch_user_accesses_membership_id').on(table.membership_id),
      index('idx_branch_user_accesses_organization_id').on(table.organization_id),
      index('idx_branch_user_accesses_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      pgPolicy('branch_user_accesses_tenant_isolation', {
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
