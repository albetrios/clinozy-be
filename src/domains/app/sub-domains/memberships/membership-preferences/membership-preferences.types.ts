import type { membership_preferences } from './membership-preferences.schema.js';

/** A `app.membership_preferences` row. */
export type MembershipPreferencesRow = typeof membership_preferences.$inferSelect;

/**
 * A member's preferences as the API returns them (launch §2.F.6). Before the first save `id`,
 * `created_at` and `updated_at` are null and the rest are the defaults.
 */
export interface MembershipPreferencesOutput {
  id: string | null;
  pinned_sections: string[];
  theme: string;
  /** The header's branch filter; empty = every branch */
  branch_ids: string[];
  patient_file_pins: string[];
  /** `room:field:value` entries, newest first, the newest 3 per `room:field` */
  recent_picks: string[];
  created_at: string | null;
  updated_at: string | null;
}
