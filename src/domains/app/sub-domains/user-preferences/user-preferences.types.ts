/** A user preference as the API returns it (launch ROUTE #8). */
export interface UserPreferenceOutput {
  id: string;
  pinned_sections: string[];
  /** Branches the header filter narrows to; empty = all branches */
  branch_filter_ids: string[];
  theme: string;
  patient_file_pins: string[];
  /** `room:fieldLabel:value` entries, last 3 per key */
  recent_picks: string[];
  created_at: string;
  updated_at: string;
}
