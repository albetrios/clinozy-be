import { MEMBERSHIP_PREFERENCE_DEFAULTS } from './membership-preferences.constants.js';
import type {
  MembershipPreferencesOutput,
  MembershipPreferencesRow,
} from './membership-preferences.types.js';

/** Shapes a `app.membership_preferences` row and its branch filter as the API returns them. */
export function serializeMembershipPreferences(
  row: MembershipPreferencesRow,
  branchPublicIds: string[],
): MembershipPreferencesOutput {
  return {
    id: row.public_id,
    pinned_sections: row.pinned_sections,
    theme: row.theme,
    branch_ids: branchPublicIds,
    patient_file_pins: row.patient_file_pins,
    recent_picks: row.recent_picks,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/** What a member has before their first save — the column defaults, `id` and times null (U4). */
export function defaultMembershipPreferences(): MembershipPreferencesOutput {
  return {
    id: null,
    pinned_sections: [...MEMBERSHIP_PREFERENCE_DEFAULTS.pinned_sections],
    theme: MEMBERSHIP_PREFERENCE_DEFAULTS.theme,
    branch_ids: [],
    patient_file_pins: [...MEMBERSHIP_PREFERENCE_DEFAULTS.patient_file_pins],
    recent_picks: [],
    created_at: null,
    updated_at: null,
  };
}
