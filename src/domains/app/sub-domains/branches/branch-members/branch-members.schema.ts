import { sql } from 'drizzle-orm';
import { bigint, foreignKey, index, pgPolicy, primaryKey, timestamp } from 'drizzle-orm/pg-core';
import { appSchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';

/**
 * Drizzle table for `app.branch_members` — who works at which branch (launch ROUTE #2; renamed
 * from `branch_user_accesses` at ROUTE #125, D9). One row per (branch, membership); the member
 * pointer is composite `(organization_id, membership_id)` so a branch only lists a member of its
 * own organization (K8). The rows stay when a membership ends — an ended member is hidden from
 * every read and comes back with a restore (D57); the membership purge cascades them. Read by
 * `GET /app/branches/my` and `GET …/members`; written by `POST /app/branches` (`membership_ids`),
 * `PUT /app/branches/{branch_id}/members` and the membership's `branch_ids`. RLS is the
 * `branch_members_tenant_isolation` policy on the organization GUC.
 */
export const branch_members = appSchema
  .table(
    'branch_members',
    {
      branch_id: bigint('branch_id', { mode: 'number' })
        .notNull()
        .references(() => branches.id, { onDelete: 'cascade' }),
      membership_id: bigint('membership_id', { mode: 'number' }).notNull(),
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
        name: 'branch_members_pkey',
        columns: [table.branch_id, table.membership_id],
      }),
      // K8: a member of this organization; the membership purge cascades the rows.
      foreignKey({
        name: 'branch_members_membership_fk',
        columns: [table.organization_id, table.membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('cascade'),
      // Backs both the composite membership key and the organization key; `/my` reads by it.
      index('idx_branch_members_organization_id_membership_id').on(
        table.organization_id,
        table.membership_id,
      ),
      index('idx_branch_members_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      pgPolicy('branch_members_tenant_isolation', {
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
