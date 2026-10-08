import { MEMBERSHIP_STATUS } from './membership.constants.js';

/**
 * The membership statuses that occupy a billable seat (REQ-4).
 *
 * @remarks
 * - **Algorithm:** an outstanding invitation already reserves a seat, so a burst of invites cannot
 *   exceed the plan limit once everyone accepts; a suspended seat is not in use and is excluded.
 * - **Failure modes:** none — a plain value.
 * - **Side effects:** none.
 * - **Notes:** the single definition behind BOTH sides of seat accounting: the
 *   `countActiveByOrganization` predicate that produces `seats_used`, and
 *   {@link membershipStatusConsumesSeat}, which decides whether a status change has to reconcile
 *   the Stripe quantity. Keeping them apart is how a suspend stopped telling billing anything.
 */
export const SEAT_CONSUMING_MEMBERSHIP_STATUSES = [
  MEMBERSHIP_STATUS.ACTIVE,
  MEMBERSHIP_STATUS.INVITED,
] as const;

/**
 * Whether a membership in this status occupies a billable seat.
 *
 * @remarks
 * - **Algorithm:** membership in {@link SEAT_CONSUMING_MEMBERSHIP_STATUSES}.
 * - **Failure modes:** none — an unknown status reads as not consuming a seat, matching the
 *   count query, which only counts the statuses it names.
 * - **Side effects:** none.
 */
export function membershipStatusConsumesSeat(status: string): boolean {
  return (SEAT_CONSUMING_MEMBERSHIP_STATUSES as readonly string[]).includes(status);
}

/**
 * Raw `tenancy.memberships` row shape from Drizzle. Holds internal numeric
 * ids and the soft-delete marker (`deleted_at`); do not return this shape
 * directly from HTTP handlers — serialize via {@link serializeMembership}.
 */
export interface MembershipRow {
  id: number;
  public_id: string;
  user_id: number;
  organization_id: number;
  role_id: number;
  status: string;
  invited_by_user_id: number | null;
  joined_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  staff_number: number;
  phone: string | null;
  tone: string;
  working_days: string[];
  work_starts_at: string;
  work_ends_at: string;
  commission_percent: string;
  delete_reason: string | null;
  delete_note: string | null;
  updated_by_user_id: number | null;
  /** The name the organization keeps for the member (launch K3). */
  display_name: string;
}

/**
 * The staff profile columns a create or update writes (launch ROUTE #4); `undefined` leaves a
 * column at its default (create) or unchanged (update), `phone: null` clears it.
 */
export interface MembershipProfileData {
  phone?: string | null;
  tone?: string;
  working_days?: string[];
  work_starts_at?: string;
  work_ends_at?: string;
  commission_percent?: string;
}

/**
 * A membership's role and branch lists as public ids (launch ROUTE #4): every role it holds, the
 * main role first (D5), and the branches it works in.
 */
export interface MembershipAccessRefs {
  role_ids: string[];
  branch_ids: string[];
}

/**
 * Embedded user summary on a membership response. Lets the frontend render a
 * members table (name, email, avatar) without an N+1 per-row user fetch. `id`
 * is the user's external public id; `avatar_url` is already presigned for read
 * (or an absolute provider URL), never a raw object key.
 */
export interface MembershipUserSummary {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

/**
 * Embedded reference to a membership's live (pending, not accepted/revoked)
 * invitation, present only on `invited` rows. Lets the frontend drive Resend /
 * Revoke straight from the members table; `null` for `active`/`suspended` rows.
 */
export interface MembershipInvitationRef {
  id: string;
  expires_at: string;
}

/**
 * Public HTTP response shape for a membership (launch §2.B.6). Every identifier is an external
 * public id; timestamps are ISO-8601 strings. `role_ids[0]` is the main role (T16 — no separate
 * `role_id` / `role`); `user` embeds the login's summary; `invitation` carries the live invite on
 * `invited` rows; `display_name`, `ended_at` and `end_reason` name an ended member (D58).
 */
export interface MembershipOutput {
  id: string;
  user_id: string;
  organization_id: string;
  status: string;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
  user: MembershipUserSummary;
  invitation: MembershipInvitationRef | null;
  /** The name the organization keeps (K3): the profile's while live, frozen once ended. */
  display_name: string;
  /** When the membership ended; `null` while live. */
  ended_at: string | null;
  /** Why it ended (`mistake` … `left`, `account_deleted`); `null` while live. */
  end_reason: string | null;
  /** The "#12" of the team table — per organization, never reused. */
  staff_number: number;
  phone: string | null;
  tone: string;
  /** Every role held, the main role first. */
  role_ids: string[];
  /** The branches this member works in (`brn_…`). */
  branch_ids: string[];
  working_days: string[];
  /** `HH:mm`. */
  work_starts_at: string;
  /** `HH:mm`, after `work_starts_at`. */
  work_ends_at: string;
  commission_percent: number;
}
