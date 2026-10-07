/** One access row as the repository reads it. */
interface BranchUserAccessRecord {
  membership_public_id: string;
  created_at: Date | string;
}

/** Response shaping for a branch's access list — membership public ids and grant times only. */
export const BranchUserAccessesSerializer = {
  many(rows: readonly BranchUserAccessRecord[]) {
    return rows.map((row) => ({
      membership_id: row.membership_public_id,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }));
  },
};
