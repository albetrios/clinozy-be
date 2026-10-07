/**
 * One active team member as a person picker shows them (`GET /app/users`).
 *
 * @remarks
 * - **Notes:** `id` is the membership (`mbr_…`) — the id every `*_membership_id` field takes.
 */
export interface AppUserOutput {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  staff_number: number;
  tone: string;
  /** Every role held, the main role first. */
  role_ids: string[];
  /** The branches the member works in. */
  branch_ids: string[];
}
