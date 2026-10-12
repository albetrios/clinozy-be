/** One access row as the repository reads it. */
interface BranchMemberRecord {
  membership_public_id: string;
  created_at: Date | string;
}

/** Response shaping for a branch's member list — membership public ids and grant times only. */
export const BranchMembersSerializer = {
  many(rows: readonly BranchMemberRecord[]) {
    return rows.map((row) => ({
      membership_id: row.membership_public_id,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }));
  },
};
