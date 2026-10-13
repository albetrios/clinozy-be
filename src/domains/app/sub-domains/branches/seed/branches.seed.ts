import { and, eq, isNull, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { branch_members } from '@/domains/app/sub-domains/branches/branch-members/branch-members.schema.js';

/** A branch to seed: its name and whether it is the organization's main branch. */
export interface SeedBranchPayload {
  organization_id: number;
  name: string;
  is_main?: boolean;
  area: string;
  created_by_user_id?: number;
  /**
   * The branch's own address, contact and defaults (the demo clinic's real-looking ones); absent
   * fields keep the placeholders below.
   */
  details?: Partial<
    Pick<
      typeof branches.$inferInsert,
      | 'tone'
      | 'address_line_one'
      | 'address_line_two'
      | 'city'
      | 'state'
      | 'postal_code'
      | 'phone'
      | 'email'
      | 'gst_number'
      | 'opens_at'
      | 'closes_at'
      | 'working_days'
      | 'maps_link'
      | 'review_link'
      | 'default_doctor_membership_id'
      | 'default_therapist_membership_id'
      | 'default_front_desk_membership_id'
    >
  >;
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
      email: `${payload.area.toLowerCase()}@example.com`,
      ...payload.details,
      created_by_user_id: payload.created_by_user_id,
      updated_by_user_id: payload.created_by_user_id,
    })
    .returning({ id: branches.id });
  return row!.id;
}

/** Gives the user's live membership in the organization access to the branch (idempotent). */
export async function seedBranchMember(options: {
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
    .insert(branch_members)
    .values({
      branch_id: options.branch_id,
      membership_id: membership.id,
      organization_id: options.organization_id,
      created_by_user_id: options.user_id,
    })
    .onConflictDoNothing();
}
