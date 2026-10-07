import { and, asc, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branch_user_accesses } from '@/domains/app/sub-domains/branches/branch-user-accesses/branch-user-accesses.schema.js';

/**
 * Persistence for `app.branch_user_accesses` — who works in which branch. Runs on the request's
 * database handle, so RLS scopes every statement to the active organization.
 */
export class BranchUserAccessesRepository {
  /** The live memberships given access to a branch, oldest grant first. */
  async listForBranch(branch_id: number) {
    return getRequestDatabase()
      .select({
        membership_public_id: memberships.public_id,
        created_at: branch_user_accesses.created_at,
      })
      .from(branch_user_accesses)
      .innerJoin(memberships, eq(memberships.id, branch_user_accesses.membership_id))
      .where(and(eq(branch_user_accesses.branch_id, branch_id), isNull(memberships.deleted_at)))
      .orderBy(asc(branch_user_accesses.created_at), asc(memberships.public_id));
  }

  /**
   * Makes `membership_ids` the branch's exact access list: removes the others, adds the missing
   * (existing grants keep their `created_at`).
   */
  async replaceForBranch(options: {
    branch_id: number;
    organization_id: number;
    membership_ids: readonly number[];
    created_by_user_id: number | undefined;
  }): Promise<void> {
    const database = getRequestDatabase();
    const removeOthers = eq(branch_user_accesses.branch_id, options.branch_id);
    await database
      .delete(branch_user_accesses)
      .where(
        options.membership_ids.length === 0
          ? removeOthers
          : and(
              removeOthers,
              notInArray(branch_user_accesses.membership_id, [...options.membership_ids]),
            ),
      );
    if (options.membership_ids.length === 0) return;
    await database
      .insert(branch_user_accesses)
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

  /** Gives the user's live membership in the organization access to the branch (idempotent). */
  async grantToUser(options: {
    branch_id: number;
    organization_id: number;
    user_id: number;
    created_by_user_id: number | undefined;
  }): Promise<void> {
    await getRequestDatabase().execute(sql`
      INSERT INTO ${branch_user_accesses}
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
