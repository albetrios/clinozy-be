import { sql } from 'drizzle-orm';
import { bigint, foreignKey, index, pgPolicy, primaryKey, timestamp } from 'drizzle-orm/pg-core';
import { appSchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';

/**
 * Drizzle table for `app.contact_members` — the team members who handle a person (launch ROUTE
 * #129, routes-final 4.B, CT11). One row per (contact, membership); the member pointer is composite
 * `(organization_id, membership_id)` so a contact only lists a member of its own organization (K8).
 * A member's rows go when they leave (K4); deleting either side removes the row. RLS is the
 * `contact_members_tenant_isolation` policy on the organization GUC.
 */
export const contact_members = appSchema
  .table(
    'contact_members',
    {
      contact_id: bigint('contact_id', { mode: 'number' })
        .notNull()
        .references(() => contacts.id, { onDelete: 'cascade' }),
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
        name: 'contact_members_pkey',
        columns: [table.contact_id, table.membership_id],
      }),
      foreignKey({
        name: 'contact_members_membership_fk',
        columns: [table.organization_id, table.membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('cascade'),
      // "My people" (`member_membership_id`) and the composite key's lookups
      index('idx_contact_members_organization_id_membership_id').on(
        table.organization_id,
        table.membership_id,
        table.contact_id,
      ),
      index('idx_contact_members_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      pgPolicy('contact_members_tenant_isolation', {
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
