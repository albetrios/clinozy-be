import type {
  MembershipSavedViewOutput,
  MembershipSavedViewRow,
} from './membership-saved-views.types.js';

/** Shapes a `app.membership_saved_views` row as the API returns it. */
export function serializeMembershipSavedView(
  row: MembershipSavedViewRow,
): MembershipSavedViewOutput {
  return {
    id: row.public_id,
    list_key: row.list_key,
    label: row.label,
    filters: row.filters as Record<string, unknown>,
    hidden_columns: row.hidden_columns,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
