import { type SQL, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  check,
  index,
  pgPolicy,
  primaryKey,
  smallint,
  timestamp,
} from 'drizzle-orm/pg-core';
import { tenancySchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { roles } from '@/domains/tenancy/sub-domains/member-roles/member-role.schema.js';
import { MEMBERSHIP_ROLE_IDS_MAX } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';

/**
 * Drizzle table for `tenancy.membership_additional_roles` — the roles a person holds besides their
 * main one (launch ROUTE #4, D5: several roles per person, access is the union). The main role stays
 * `memberships.role_id`; these rows are the "Also" roles, in `position` order. Read by the
 * permission resolution and the team list; written by the member invite and edit. RLS is the
 * `membership_additional_roles_tenant_isolation` policy on the organization GUC.
 */
export const membership_additional_roles = tenancySchema
  .table(
    'membership_additional_roles',
    {
      membership_id: bigint('membership_id', { mode: 'number' })
        .notNull()
        .references(() => memberships.id, { onDelete: 'cascade' }),
      // CASCADE, not RESTRICT: the role delete guard already refuses a role anyone holds, and an
      // organization purge removes roles and memberships in one cascade.
      role_id: bigint('role_id', { mode: 'number' })
        .notNull()
        .references(() => roles.id, { onDelete: 'cascade' }),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      // 1 = the first additional role (the main role is position 0, on the membership).
      position: smallint('position').notNull(),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      primaryKey({
        name: 'membership_additional_roles_pkey',
        columns: [table.membership_id, table.role_id],
      }),
      // The permission join and the role member counts read by role.
      index('idx_membership_additional_roles_role_id').on(table.role_id),
      index('idx_membership_additional_roles_organization_id').on(table.organization_id),
      index('idx_membership_additional_roles_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      check(
        'chk_membership_additional_roles_position',
        sql`${table.position} BETWEEN 1 AND ${sql.raw(String(MEMBERSHIP_ROLE_IDS_MAX - 1))}`,
      ),
      pgPolicy('membership_additional_roles_tenant_isolation', {
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

/**
 * SQL condition: the membership holds `role` — as its main role or as an additional one (D5).
 *
 * @remarks
 * - **Algorithm:** `memberships.role_id = role OR EXISTS (an additional-role row for the pair)`;
 *   the EXISTS probes the primary key (membership_id, role_id).
 * - **Notes:** the one definition every "who holds which role" read uses — the permission
 *   resolution, the permission holder lookup, the role member counts and the role delete guard —
 *   so a person's access is always the union of their roles.
 */
export function membershipHoldsRole(role: AnyPgColumn | number): SQL {
  return sql`(${memberships.role_id} = ${role} OR EXISTS (
    SELECT 1 FROM ${membership_additional_roles}
    WHERE ${membership_additional_roles.membership_id} = ${memberships.id}
      AND ${membership_additional_roles.role_id} = ${role}
  ))`;
}
