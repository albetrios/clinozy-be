import type { ContactMemberOutput } from './contact-members.types.js';

/** Shapes a contact's member rows as the API returns them — the `mem_` id and when it was added. */
export function serializeContactMembers(
  rows: readonly { membership_public_id: string; created_at: Date }[],
): ContactMemberOutput[] {
  return rows.map((row) => ({
    membership_id: row.membership_public_id,
    created_at: row.created_at.toISOString(),
  }));
}
