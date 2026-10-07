import { and, eq, isNull, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { branch_user_accesses } from '@/domains/app/sub-domains/branches/branch-user-accesses/branch-user-accesses.schema.js';

/** A branch to seed: its name and whether it is the organization's main branch. */
export interface SeedBranchPayload {
  organization_id: number;
  name: string;
  is_main?: boolean;
  area: string;
  created_by_user_id?: number;
}

/**
 * Inserts a branch unless a live one with the same name exists in the organization (idempotent);
 * returns its id either way.
 */
export async function seedBranch(payload: SeedBranchPayload): Promise<number> {
  const database = getRequestDatabase();
  const existing = await database
    .select({ id: branches.id })
    .from(branches)
    .where(
      and(
        eq(branches.organization_id, payload.organization_id),
        sql`lower(${branches.name}) = lower(${payload.name})`,
        isNull(branches.deleted_at),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [row] = await database
    .insert(branches)
    .values({
      public_id: generatePublicId('branch'),
      organization_id: payload.organization_id,
      name: payload.name,
      is_main: payload.is_main ?? false,
      address_line_one: `1 ${payload.area} Main Road`,
      area: payload.area,
      city: 'Surat',
      postal_code: '395009',
      phone: '+919800000000',
      email: `${payload.area.toLowerCase()}@clinic.example.com`,
      created_by_user_id: payload.created_by_user_id,
      updated_by_user_id: payload.created_by_user_id,
    })
    .returning({ id: branches.id });
  return row!.id;
}

/** Gives the user's live membership in the organization access to the branch (idempotent). */
export async function seedBranchUserAccess(options: {
  branch_id: number;
  organization_id: number;
  user_id: number;
}): Promise<void> {
  const [membership] = await getRequestDatabase()
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.user_id, options.user_id),
        eq(memberships.organization_id, options.organization_id),
        isNull(memberships.deleted_at),
      ),
    )
    .limit(1);
  if (!membership) return;
  await getRequestDatabase()
    .insert(branch_user_accesses)
    .values({
      branch_id: options.branch_id,
      membership_id: membership.id,
      organization_id: options.organization_id,
      created_by_user_id: options.user_id,
    })
    .onConflictDoNothing();
}
