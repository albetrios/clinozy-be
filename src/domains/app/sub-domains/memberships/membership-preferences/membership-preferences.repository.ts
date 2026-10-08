import { and, asc, eq, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  membership_preference_branches,
  membership_preferences,
} from './membership-preferences.schema.js';
import type { MembershipPreferencesRow } from './membership-preferences.types.js';

/** The columns a save writes — any of them; the rest keep their stored (or default) value. */
export type MembershipPreferencesFields = Partial<
  Pick<MembershipPreferencesRow, 'pinned_sections' | 'theme' | 'patient_file_pins' | 'recent_picks'>
>;

/**
 * Persistence for `app.membership_preferences` and its branch filter
 * (`app.membership_preference_branches`) — one row per membership. Runs on the request's database
 * handle, so RLS scopes every statement to the active organization.
 */
export class MembershipPreferencesRepository {
  /** The membership's preferences row, if it ever saved one. */
  async findByMembershipId(membership_id: number): Promise<MembershipPreferencesRow | undefined> {
    const rows = await getRequestDatabase()
      .select()
      .from(membership_preferences)
      .where(eq(membership_preferences.membership_id, membership_id))
      .limit(1);
    return rows[0];
  }

  /**
   * Creates the membership's row with `fields` over the defaults, or saves `fields` on it (U4) —
   * one `INSERT … ON CONFLICT (membership_id) DO UPDATE`, so two first saves at once both land.
   */
  async upsert(options: {
    organization_id: number;
    membership_id: number;
    fields: MembershipPreferencesFields;
    user_id: number | null;
  }): Promise<MembershipPreferencesRow> {
    const rows = await getRequestDatabase()
      .insert(membership_preferences)
      .values({
        public_id: generatePublicId('membershipPreference'),
        organization_id: options.organization_id,
        membership_id: options.membership_id,
        ...options.fields,
        created_by_user_id: options.user_id,
        updated_by_user_id: options.user_id,
      })
      .onConflictDoUpdate({
        target: membership_preferences.membership_id,
        set: {
          ...options.fields,
          updated_at: sql`greatest(${membership_preferences.created_at}, now())`,
          updated_by_user_id: options.user_id,
        },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('membership_preferences upsert returned no row');
    return row;
  }

  /** The branch filter's branches (`brn_…`), by branch name. */
  async listBranchPublicIds(membership_preference_id: number): Promise<string[]> {
    const rows = await getRequestDatabase()
      .select({ public_id: branches.public_id })
      .from(membership_preference_branches)
      .innerJoin(branches, eq(branches.id, membership_preference_branches.branch_id))
      .where(eq(membership_preference_branches.membership_preference_id, membership_preference_id))
      .orderBy(asc(branches.name), asc(branches.public_id));
    return rows.map((row) => row.public_id);
  }

  /** Makes `branch_ids` the branch filter's exact list (empty = every branch). */
  async replaceBranches(options: {
    membership_preference_id: number;
    organization_id: number;
    branch_ids: readonly number[];
  }): Promise<void> {
    const database = getRequestDatabase();
    await database
      .delete(membership_preference_branches)
      .where(
        eq(
          membership_preference_branches.membership_preference_id,
          options.membership_preference_id,
        ),
      );
    if (options.branch_ids.length === 0) return;
    await database.insert(membership_preference_branches).values(
      options.branch_ids.map((branch_id) => ({
        membership_preference_id: options.membership_preference_id,
        branch_id,
        organization_id: options.organization_id,
      })),
    );
  }

  /** Deletes the membership's preferences and branch filter — the leave step (K4). */
  async deleteForMembership(options: {
    organization_id: number;
    membership_id: number;
  }): Promise<void> {
    await getRequestDatabase()
      .delete(membership_preferences)
      .where(
        and(
          eq(membership_preferences.organization_id, options.organization_id),
          eq(membership_preferences.membership_id, options.membership_id),
        ),
      );
  }
}
