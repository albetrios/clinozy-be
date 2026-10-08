/**
 * Raw `tenancy.roles` row shape as returned by Drizzle queries. Internal
 * identifiers (`id`, `organization_id`) and the soft-delete marker
 * (`deleted_at`) are present here and must not leak to API responses.
 */
export interface MemberRoleRow {
  id: number;
  public_id: string;
  organization_id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  tone: string;
  is_locked: boolean;
  deleted_at: Date | null;
  /** Why it was deleted (T12); set exactly when `deleted_at` is. */
  delete_reason: string | null;
  delete_note: string | null;
  created_at: Date;
  updated_at: Date;
  updated_by_user_id: number | null;
}

/**
 * Public HTTP response shape for a role. `id` is the role's external
 * `public_id`; timestamps are ISO-8601 strings. `member_count` is the number of
 * active or invited memberships assigned this role in the organization (0 when
 * none) — computed per response, never stored.
 */
export interface MemberRoleOutput {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  /** The role's chip colour. */
  tone: string;
  /** True when the role's access cannot be edited (only Admin, D40). */
  is_locked: boolean;
  member_count: number;
  created_at: string;
  updated_at: string;
}
