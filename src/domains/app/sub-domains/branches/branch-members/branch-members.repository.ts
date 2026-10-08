import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branch_members } from '@/domains/app/sub-domains/branches/branch-members/branch-members.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';

/**
 * Persistence for `app.branch_members` — who works in which branch. Runs on the request's
 * database handle, so RLS scopes every statement to the active organization.
 */
export class BranchMembersRepository {
  /** The live memberships given access to a branch, oldest grant first. */
  async listForBranch(branch_id: number) {
    return getRequestDatabase()
      .select({
        membership_public_id: memberships.public_id,
        created_at: branch_members.created_at,
      })
      .from(branch_members)
      .innerJoin(memberships, eq(memberships.id, branch_members.membership_id))
      .where(and(eq(branch_members.branch_id, branch_id), isNull(memberships.deleted_at)))
      .orderBy(asc(branch_members.created_at), asc(memberships.public_id));
  }

  /**
   * Makes `membership_ids` the branch's exact list of live members: removes the other live members,
   * adds the missing (existing rows keep their `created_at`). An ended member's row is never touched
   * — it is hidden while the membership is ended and comes back with a restore (D57).
   */
  async replaceForBranch(options: {
    branch_id: number;
    organization_id: number;
    membership_ids: readonly number[];
    created_by_user_id: number | undefined;
  }): Promise<void> {
    const database = getRequestDatabase();
    const removeOthers = and(
      eq(branch_members.branch_id, options.branch_id),
      inArray(
        branch_members.membership_id,
        database
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.organization_id, options.organization_id),
              isNull(memberships.deleted_at),
            ),
          ),
      ),
    );
    await database
      .delete(branch_members)
      .where(
        options.membership_ids.length === 0
          ? removeOthers
          : and(
              removeOthers,
              notInArray(branch_members.membership_id, [...options.membership_ids]),
            ),
      );
    if (options.membership_ids.length === 0) return;
    await database
      .insert(branch_members)
      .values(
        options.membership_ids.map((membership_id) => ({
          branch_id: options.branch_id,
          membership_id,
          organization_id: options.organization_id,
          created_by_user_id: options.created_by_user_id,
        })),
      )
      .onConflictDoNothing();
  }

  /** The live branches each membership works in (`brn_…`, by branch name); absent when none. */
  async listBranchPublicIdsByMembershipIds(
    membership_ids: readonly number[],
  ): Promise<Map<number, string[]>> {
    const byMembership = new Map<number, string[]>();
    if (membership_ids.length === 0) return byMembership;
    const rows = await getRequestDatabase()
      .select({
        membership_id: branch_members.membership_id,
        branch_public_id: branches.public_id,
      })
      .from(branch_members)
      .innerJoin(branches, eq(branches.id, branch_members.branch_id))
      .where(inArray(branch_members.membership_id, [...membership_ids]))
      .orderBy(asc(branches.name));
    for (const row of rows) {
      const list = byMembership.get(row.membership_id) ?? [];
      list.push(row.branch_public_id);
      byMembership.set(row.membership_id, list);
    }
    return byMembership;
  }

  /**
   * Makes `branch_ids` the membership's exact branch list: removes the others, adds the missing
   * (existing grants keep their `created_at`).
   */
  async replaceForMembership(options: {
    membership_id: number;
    organization_id: number;
    branch_ids: readonly number[];
    created_by_user_id: number | null;
  }): Promise<void> {
    const database = getRequestDatabase();
    const ofMembership = eq(branch_members.membership_id, options.membership_id);
    await database
      .delete(branch_members)
      .where(
        options.branch_ids.length === 0
          ? ofMembership
          : and(ofMembership, notInArray(branch_members.branch_id, [...options.branch_ids])),
      );
    if (options.branch_ids.length === 0) return;
    await database
      .insert(branch_members)
      .values(
        options.branch_ids.map((branch_id) => ({
          branch_id,
          membership_id: options.membership_id,
          organization_id: options.organization_id,
          created_by_user_id: options.created_by_user_id,
        })),
      )
      .onConflictDoNothing();
  }

  /**
   * The internal ids of every membership with a row at the branch — ended ones included; the
   * membership list decides whether it shows ended members (the team list filter, launch T2).
   */
  async listMembershipIdsForBranch(branch_id: number): Promise<number[]> {
    const rows = await getRequestDatabase()
      .select({ membership_id: branch_members.membership_id })
      .from(branch_members)
      .where(eq(branch_members.branch_id, branch_id));
    return rows.map((row) => row.membership_id);
  }

  /** The internal ids of a branch's live members (an ended member is not one, D57). */
  async listLiveMembershipIds(branch_id: number): Promise<Set<number>> {
    const rows = await getRequestDatabase()
      .select({ membership_id: branch_members.membership_id })
      .from(branch_members)
      .innerJoin(memberships, eq(memberships.id, branch_members.membership_id))
      .where(and(eq(branch_members.branch_id, branch_id), isNull(memberships.deleted_at)));
    return new Set(rows.map((row) => row.membership_id));
  }

  /** Gives the user's live membership in the organization access to the branch (idempotent). */
  async grantToUser(options: {
    branch_id: number;
    organization_id: number;
    user_id: number;
    created_by_user_id: number | undefined;
  }): Promise<void> {
    await getRequestDatabase().execute(sql`
      INSERT INTO ${branch_members}
        (branch_id, membership_id, organization_id, created_by_user_id)
      SELECT ${options.branch_id}, ${memberships.id}, ${options.organization_id},
             ${options.created_by_user_id ?? null}
      FROM ${memberships}
      WHERE ${memberships.user_id} = ${options.user_id}
        AND ${memberships.organization_id} = ${options.organization_id}
        AND ${memberships.deleted_at} IS NULL
      ON CONFLICT DO NOTHING
    `);
  }
}
