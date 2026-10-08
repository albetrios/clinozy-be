/**
 * One team member as a person picker and the member directory show them (`GET /app/memberships`,
 * launch §2.A, K5).
 *
 * @remarks
 * - **Notes:** `id` is the membership (`mem_…`) — the id every `*_membership_id` field takes;
 *   `display_name` is the name the organization keeps (K3) — the one place the app turns a
 *   membership id into a name.
 */
export interface AppMembershipOutput {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  staff_number: number;
  tone: string;
  /** Every role held, the main role first. */
  role_ids: string[];
  /** The branches the member works in. */
  branch_ids: string[];
  /** Live and active — the members a picker offers. */
  is_active: boolean;
  /** When the membership ended; `null` while live. */
  ended_at: string | null;
}
