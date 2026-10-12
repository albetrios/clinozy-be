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
  /** The organization's owner (launch D81 (4)). */
  is_owner: boolean;
  /** When the membership ended; `null` while live. */
  ended_at: string | null;
}

/**
 * One role as every member reads it (`GET /app/roles`, launch D81 (4)) — the role directory that
 * turns a `rol_…` id in `role_ids` into a name and a colour, as `GET /app/memberships` does for
 * members.
 *
 * @remarks
 * - **Notes:** a preset is `is_system` with its fixed name (Owner, Admin, Doctor, …); `is_locked`
 *   marks the roles whose access never changes (Owner, Admin). No codes and no member counts — those
 *   stay with `role:read` (`/tenancy/organization/roles`).
 */
export interface AppRoleOutput {
  id: string;
  name: string;
  tone: string;
  is_system: boolean;
  is_locked: boolean;
}
